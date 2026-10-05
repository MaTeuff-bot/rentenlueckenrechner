#!/usr/bin/env python3
"""Research-only stdlib harness. All writes confined to this directory.
Run: python3 followup.py [--refresh-cpi] [--paths 5000]
Cached first-stage evidence is immutable; refresh affects follow-up CPI only.
"""
import argparse, calendar, csv, datetime as dt, hashlib, io, json, math, pathlib, random, re, statistics as st, urllib.request
H = pathlib.Path(__file__).resolve().parent
P = argparse.ArgumentParser(); P.add_argument('--refresh-cpi', action='store_true'); P.add_argument('--paths', type=int, default=5000)
A = P.parse_args(); assert A.paths > 0
SEED = 20261005
URL = 'https://api.statistiken.bundesbank.de/rest/data/BBDP1/M.DE.N.VPI.C.A00000.VGJ.LV?format=csv&lang=en'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def dump(name, obj): (H/name).write_text(json.dumps(obj, indent=2, allow_nan=False)+'\n')
def csvout(name, rows):
    assert rows
    with (H/name).open('w', newline='') as f:
        w=csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
old=json.loads((H/'sources.json').read_text()); provenance={}
for name in ['su0022-official.csv','sud101-official.csv','official-methodology.pdf','official-su0022-search.html']:
    assert sha(H/name)==old[name]['sha256']; provenance[name]=old[name]
for name in ['REPORT.md','research.py','bundled-app-inputs.json']:
    provenance[name]={'sha256':sha(H/name),'role':'immutable first-stage evidence'}
cp=H/'followup-cpi-official.csv'; mp=H/'followup-sources.json'
if A.refresh_cpi or not cp.exists():
    with urllib.request.urlopen(URL, timeout=120) as r:
        raw=r.read(); headers=dict(r.headers)
    cp.write_bytes(raw)
    cprov={'url':URL,'downloaded_at_utc':dt.datetime.now(dt.timezone.utc).isoformat(),'sha256':sha(cp),'response_headers':headers}
else:
    cprov=json.loads(mp.read_text())['followup-cpi-official.csv']; assert sha(cp)==cprov['sha256']
provenance[cp.name]=cprov

def parse(name, identifier):
    rows=list(csv.reader(io.StringIO((H/name).read_text(encoding='utf-8-sig')))); assert rows[0][1]==identifier
    obs={}; meta=[]
    for r in rows:
        if r and re.fullmatch(r'\d{4}-\d{2}',r[0]):
            assert r[0] not in obs
            obs[r[0]]={'value': None if r[1]=='.' else float(r[1])/100,'flag':r[2] if len(r)>2 else ''}
        else: meta.append(r)
    return obs,meta
su,sm=parse('su0022-official.csv','BBIB1.M.DE.B.H.DNB.SPM.K3M.A.N1.11A')
sud,dm=parse('sud101-official.csv','BBIM1.M.DE.B.L21.A.R.A.2250.EUR.N')
cpi,cm=parse(cp.name,'BBDP1.M.DE.N.VPI.C.A00000.VGJ.LV')
app=json.loads((H/'bundled-app-inputs.json').read_text()); bundled={int(y):v for y,v in app['inflation'].items()}
assert sorted(bundled)==list(range(1950,2021))
equity_years={int(y) for y in app['jst_equity_real']}; assert max(equity_years)==2020
# Never output raw third-party equity observations in the follow-up.
monthly=[]; coverage=[]; live={}
for y in range(int(min(cpi)[:4]),int(max(cpi)[:4])+1):
    keys=[f'{y}-{m:02}' for m in range(1,13)]; valid=[k for k in keys if k in cpi and cpi[k]['value'] is not None]
    coverage.append({'year':y,'archive_rows':sum(k in cpi for k in keys),'valid_months':len(valid),'complete':len(valid)==12,'missing_required':';'.join(k for k in keys if k not in valid)})
    if len(valid)==12: live[y]=st.mean(cpi[k]['value'] for k in valid)
for k,v in sorted(cpi.items()): monthly.append({'month':k,'monthly_yoy':v['value'],'flag':v['flag']})
csvout('followup-cpi-monthly.csv',monthly); csvout('followup-cpi-coverage.csv',coverage)
latest=max(y for y in live if y<dt.datetime.now(dt.timezone.utc).year)
assert sorted(y for y in live if 1950<=y<=latest)==list(range(1950,latest+1))
extended=dict(bundled); extended.update({y:v for y,v in live.items() if 2020<y<=latest})
assert sorted(extended)==list(range(1950,latest+1)); assert all(extended[y]==bundled[y] for y in bundled)
revisions=[{'year':y,'bundled':bundled[y],'live':live[y],'live_minus_bundled':live[y]-bundled[y]} for y in sorted(bundled)]
csvout('followup-cpi-revisions.csv',revisions)
csvout('followup-cpi-annual.csv',[{'year':y,'extension_only':extended[y],'live_revised':live[y],'extension_only_origin':'bundled 1950-2020' if y<=2020 else 'live 12-month mean'} for y in sorted(extended)])

def valid_year(data,y): return [(k,o['value']) for k,o in sorted(data.items()) if k.startswith(str(y)) and o['value'] is not None]
# Date convention: old survey quote becomes effective 15th of its reporting month.
# Integrate simple quoted annual rate over ACT/calendar-year days, carrying last quote;
# prior-year quote supplies Jan boundary, final quote persists to next Jan 1. No monthly history output.
def carry(y):
    start=dt.date(y,1,1); end=dt.date(y+1,1,1)
    points=[(dt.date(int(k[:4]),int(k[5:]),15),o['value'],k) for k,o in sorted(su.items()) if o['value'] is not None]
    prior=[p for p in points if p[0]<=start]
    if not prior: return None,[]
    current=prior[-1]; t=start; total=0; seg=[]
    for p in [p for p in points if start<p[0]<end]+[(end,None,'year boundary')]:
        days=(p[0]-t).days; total+=days*current[1]
        seg.append({'year':y,'start':str(t),'end_exclusive':str(p[0]),'days':days,'quote_month':current[2],'quoted_rate':current[1]})
        t=p[0]; current=p
    assert sum(s['days'] for s in seg)==(end-start).days
    return total/(end-start).days,seg
rates={}; audit=[]; segments=[]; sensitivity=[]
for y in range(1967,latest+1):
    d=su if y<=2002 else sud; vals=valid_year(d,y); chosen=[]; reason=''; convention=''
    if y==1967: reason='partial source year; excluded, no Jan boundary'
    elif y<1975:
        # Feb/May/Aug/Nov schedule from 1969. 1968 has one quote per quarter with a Q4 November shift.
        wanted=[3,6,9,11] if y==1968 else [2,5,8,11]
        chosen=[(k,v) for k,v in vals if int(k[5:]) in wanted]
        assert len(chosen)==4 and {((int(k[5:])-1)//3) for k,v in chosen}==set(range(4))
        rates[y]=st.mean(v for k,v in chosen); convention='equal four quarterly representatives'
    elif len(vals)==12:
        chosen=vals; rates[y]=st.mean(v for k,v in chosen); convention='equal 12 monthly quotes'
    else: reason='missing required monthly quote: January 1975' if y==1975 else 'incomplete source year'
    nonchosen=[k for k,v in vals if k not in {k for k,v in chosen}]
    audit.append({'year':y,'source':'SU0022' if y<=2002 else 'SUD101','valid_quotes':len(vals),'selected_quotes':';'.join(k for k,v in chosen),'extra_quotes_not_equal_weighted':';'.join(nonchosen),'nominal':rates.get(y),'convention':convention,'exclusion':reason,'planned_nonreport_months':';'.join(f'{y}-{m:02}' for m in range(1,13) if f'{y}-{m:02}' not in {k for k,v in vals}) if 1968<=y<1975 else ''})
    if 1968<=y<=1975:
        cf,sg=carry(y); segments+=sg
        sensitivity.append({'year':y,'baseline_quarterly':rates.get(y),'all_available_equal_mean':st.mean(v for k,v in vals),'carry_forward_act_year_midmonth':cf,'difference_carry_minus_baseline':cf-rates[y] if y in rates else None})
csvout('followup-rate-annualization.csv',audit); csvout('followup-carry-segments.csv',segments)
csvout('followup-early-sensitivity.csv',sensitivity)
# January 1975 remains unobserved; explicit alternative assumptions ONLY.
vals75=valid_year(su,1975); previous=su['1974-11']['value']; first=su['1975-02']['value']
alt75={'exclude':None,'available_11_month_mean':st.mean(v for k,v in vals75),'jan_prior_nov_quote':(sum(v for k,v in vals75)+previous)/12,'jan_first_feb_quote':(sum(v for k,v in vals75)+first)/12,'jan_midpoint_prior_and_first':(sum(v for k,v in vals75)+(previous+first)/2)/12,'carry_forward_midmonth':carry(1975)[0]}

def q(v,p):
    s=sorted(v); x=(len(s)-1)*p; i=int(x); j=math.ceil(x); return s[i]+(s[j]-s[i])*(x-i)
def dist(v):
    return {'n':len(v),'mean':st.mean(v),'sd':st.stdev(v) if len(v)>1 else None,'geometric_mean':math.expm1(st.mean(math.log1p(x) for x in v)) if min(v)>-1 else None,'min':min(v),'p05':q(v,.05),'p25':q(v,.25),'median':q(v,.5),'p75':q(v,.75),'p95':q(v,.95),'max':max(v),'negative_share':sum(x<0 for x in v)/len(v)}
def corr(x,y): return st.correlation(x,y) if len(x)>1 and st.stdev(x)>0 and st.stdev(y)>0 else None
def sample(rate,cp,start=1968,end=latest):
    return [{'year':y,'nominal':rate[y],'inflation':cp[y],'real':(1+rate[y])/(1+cp[y])-1} for y in sorted(set(rate)&set(cp)) if start<=y<=end]
def metrics(rows):
    return {'n':len(rows),'years':[r['year'] for r in rows],'nominal':dist([r['nominal'] for r in rows]),'inflation':dist([r['inflation'] for r in rows]),'real':dist([r['real'] for r in rows]),'nominal_inflation_correlation':corr([r['nominal'] for r in rows],[r['inflation'] for r in rows]),'real_inflation_correlation':corr([r['real'] for r in rows],[r['inflation'] for r in rows])}
strict={y:r for y,r in rates.items() if y>=1976}
windows={'frequency_aware_extended':sample(rates,extended),'frequency_aware_bundled_end2020':sample(rates,extended,end=2020),'frequency_aware_live_revised':sample(rates,live),'strict_month_original_1976_2020':sample(strict,bundled,end=2020),'strict_month_extended':sample(strict,extended),'modern_only_2003_latest':sample(rates,extended,start=2003),'modern_only_2003_2020':sample(rates,bundled,start=2003,end=2020)}
cf_rates=dict(rates); cf_rates.update({y:carry(y)[0] for y in range(1968,1976)})
windows['early_carry_including1975_extended']=sample(cf_rates,extended)
for label,r in alt75.items():
    if r is not None:
        alternative=dict(rates); alternative[1975]=r; windows['1975_'+label]=sample(alternative,extended)
stats={name:metrics(rows) for name,rows in windows.items()}
assert stats['strict_month_original_1976_2020']['n']==45
expected=[y for y in range(1968,latest+1) if y!=1975]
assert stats['frequency_aware_extended']['years']==expected
annual=[]
for name,rows in windows.items():
    for r in rows: annual.append({'window':name,**r})
csvout('followup-analysis-inputs.csv',annual)
flat=[]
def flatten(name, m):
    row={'sample':name,'n':m['n'],'first':min(m['years']),'last':max(m['years']),'nominal_inflation_correlation':m['nominal_inflation_correlation'],'real_inflation_correlation':m['real_inflation_correlation']}
    for var in ['nominal','real','inflation']:
        for k,v in m[var].items():
            if k!='n': row[var+'_'+k]=v
    return row
for name,m in stats.items(): flat.append(flatten(name,m))
decades={}
for name in ['frequency_aware_extended','frequency_aware_live_revised','modern_only_2003_latest']:
    decades[name]={}
    for d in range(1960,latest+1,10):
        rows=[r for r in windows[name] if d<=r['year']<d+10]
        if rows: decades[name][str(d)]=metrics(rows); flat.append(flatten(name+'_decade_'+str(d),decades[name][str(d)]))
csvout('followup-statistics.csv',flat)
rolling=[]; rolling_summary={}
for name,rows in windows.items():
    rolling_summary[name]={}
    for length in [10,30]:
        subset=[]
        for i in range(len(rows)-length+1):
            w=rows[i:i+length]
            if w[-1]['year']-w[0]['year']!=length-1: continue
            rec={'window':name,'length':length,'start':w[0]['year'],'end':w[-1]['year'],'nominal_mean':st.mean(r['nominal'] for r in w),'real_mean':st.mean(r['real'] for r in w),'nominal_geometric':math.expm1(st.mean(math.log1p(r['nominal']) for r in w)),'real_geometric':math.expm1(st.mean(math.log1p(r['real']) for r in w)),'nominal_factor':math.prod(1+r['nominal'] for r in w),'purchasing_power_factor':math.prod(1+r['real'] for r in w)}
            subset.append(rec); rolling.append(rec)
        rolling_summary[name][str(length)]={k:dist([r[k] for r in subset]) for k in ['nominal_mean','real_mean','nominal_geometric','real_geometric','nominal_factor','purchasing_power_factor']} if subset else {'n':0}
csvout('followup-rolling.csv',rolling)
# Paired common index stream per window/horizon/block: all three models use exactly same CPI years.
# iid indices uniform; experimental non-circular moving blocks, no wrapping/gap-crossing.
boot=[]; boot_summary={}; negative_years=[]
boot_windows=['frequency_aware_extended','frequency_aware_bundled_end2020','frequency_aware_live_revised','strict_month_original_1976_2020','strict_month_extended','modern_only_2003_latest','modern_only_2003_2020','early_carry_including1975_extended']
for name in boot_windows:
    rows=windows[name]; real=[r['real'] for r in rows]; ar=st.mean(real); geo=math.expm1(st.mean(math.log1p(x) for x in real))
    constants={'constant_real_arithmetic':ar,'constant_real_geometric':geo}
    for model,c in constants.items():
        for r in rows:
            n=(1+c)*(1+r['inflation'])-1
            if n<0: negative_years.append({'window':name,'model':model,'fitted_real':c,'year':r['year'],'sampled_cpi':r['inflation'],'renominalized_nominal':n})
    boot_summary[name]={'fitted_descriptive_real_arithmetic':ar,'fitted_descriptive_real_geometric':geo,'sampling':{}}
    for block in [1,3,5]:
        starts=[i for i in range(len(rows)-block+1) if rows[i+block-1]['year']-rows[i]['year']==block-1]
        assert starts
        # Blocks may cross 1991/2003 if calendar contiguous; never excluded 1975, never wrap endpoints.
        for horizon in [10,30]:
            rng=random.Random(SEED+1000*block+horizon)
            outputs={model:[] for model in ['observed_joint',*constants]}; year_negative={model:0 for model in outputs}; year_nom={model:[] for model in outputs}; year_real={model:[] for model in outputs}
            for rep in range(A.paths):
                idx=[]
                while len(idx)<horizon:
                    start=rng.choice(starts); idx.extend(range(start,start+block))
                idx=idx[:horizon]; path=[rows[i] for i in idx]
                draw_hash=hashlib.sha256(','.join(str(r['year']) for r in path).encode()).hexdigest()
                for model in outputs:
                    n=[r['nominal'] if model=='observed_joint' else (1+constants[model])*(1+r['inflation'])-1 for r in path]
                    rr=[(1+v)/(1+r['inflation'])-1 for v,r in zip(n,path)]
                    if model!='observed_joint': assert all(abs(x-constants[model])<1e-14 for x in rr)
                    nn=sum(v<0 for v in n); year_negative[model]+=nn; year_nom[model].extend(n); year_real[model].extend(rr)
                    rec={'window':name,'block_length':block,'horizon':horizon,'replicate':rep,'model':model,'paired_years_sha256':draw_hash,'nominal_mean':st.mean(n),'real_mean':st.mean(rr),'nominal_factor':math.prod(1+v for v in n),'purchasing_power_factor':math.prod(1+v for v in rr),'negative_nominal_years':nn,'any_negative_nominal':nn>0,'nominal_factor_below_one':math.prod(1+v for v in n)<1,'purchasing_power_below_one':math.prod(1+v for v in rr)<1}
                    outputs[model].append(rec); boot.append(rec)
            summaries={}
            for model,out in outputs.items():
                summaries[model]={'paths':A.paths,'year_draws':A.paths*horizon,'annual_nominal':dist(year_nom[model]),'annual_real':dist(year_real[model]),'negative_nominal_year_frequency':year_negative[model]/(A.paths*horizon),'paths_with_negative_nominal_frequency':st.mean(r['any_negative_nominal'] for r in out),'nominal_factor_below_one_frequency':st.mean(r['nominal_factor_below_one'] for r in out),'purchasing_power_below_one_frequency':st.mean(r['purchasing_power_below_one'] for r in out),**{k:dist([r[k] for r in out]) for k in ['nominal_mean','real_mean','nominal_factor','purchasing_power_factor']}}
            assert len({r['paired_years_sha256'] for r in [outputs[m][0] for m in outputs]})==1
            boot_summary[name]['sampling'][f'block{block}_horizon{horizon}']={'eligible_block_starts':len(starts),'seed':SEED+1000*block+horizon,'models':summaries}
csvout('followup-bootstrap-paths.csv',boot); csvout('followup-negative-renominalized-years.csv',negative_years)
# Source hashes and output integrity assertions; no src read/write, no app simulation claimed.
result={'units':'fractional annual returns; factors dimensionless; own calculations','latest_complete_calendar_year':latest,'source_metadata':{'SU0022':sm,'SUD101':dm,'CPI':cm},'source_counts':{label:{'rows':len(d),'valid':sum(o['value'] is not None for o in d.values()),'first':min(d),'last':max(d),'flags':{k:o['flag'] for k,o in d.items() if o['flag']}} for label,d in [('SU0022',su),('SUD101',sud),('CPI',cpi)]},'cpi':{'bundled_n':len(bundled),'live_complete_1950_onward_n':sum(1950<=y<=latest for y in live),'extension_n':len(extended),'extension_years':[y for y in extended if y>2020],'overlap_n':len(revisions),'changed_overlap_years':[r['year'] for r in revisions if abs(r['live_minus_bundled'])>1e-12],'max_abs_revision':max(abs(r['live_minus_bundled']) for r in revisions),'mean_revision':st.mean(r['live_minus_bundled'] for r in revisions)},'statistics':stats,'decades':decades,'rolling_distributions':rolling_summary,'1975_nominal_sensitivity':alt75,'bootstrap':{'paths_per_model_horizon_block':A.paths,'base_seed':SEED,'path_records':len(boot),'windows':boot_summary},'equity_intersection':{'JST_last_year':max(equity_years),'frequency_aware_years':[r['year'] for r in windows['frequency_aware_extended'] if r['year'] in equity_years],'strict_years':[r['year'] for r in windows['strict_month_original_1976_2020'] if r['year'] in equity_years]},'limitations':['descriptive fitted constants, not predictive','deposit-only gross compounding, not app retirement/tax/KV/PV simulation','1975 excluded primary; explicit alternative assumptions only','no fabricated monthly observations; carry integration is modeled quote duration','optional blocks allowed across geography/product break, no circular wrap or calendar gap crossing','no clamping, dropping or redrawing negative nominal outcomes']}
dump('followup-results.json',result)
for name in ['REPORT.md','research.py','bundled-app-inputs.json']: assert sha(H/name)==provenance[name]['sha256']
provenance['followup.py']={'sha256':sha(H/'followup.py'),'role':'stdlib own-calculation executable harness'}
provenance['output_hashes']={p.name:sha(p) for p in sorted(H.glob('followup-*.csv'))}
provenance['output_hashes']['followup-results.json']=sha(H/'followup-results.json')
dump('followup-sources.json',provenance)
print(json.dumps({'latest':latest,'counts':{k:v['n'] for k,v in stats.items()},'cpi':result['cpi'],'path_records':len(boot),'main':stats['frequency_aware_extended'],'1975':alt75},indent=2))

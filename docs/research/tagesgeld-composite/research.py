#!/usr/bin/env python3
"""Research only. Python 3 stdlib. Run from any cwd; --refresh re-downloads official snapshots.
No filling of missing monthly observations. Rates/returns in output CSVs are fractions.
"""
import argparse, csv, datetime, hashlib, io, json, math, pathlib, random, re, statistics, urllib.request
HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
API = 'https://api.statistiken.bundesbank.de/rest/data/'
SEARCH = 'https://statistiken.bundesbank.de/statistiken-en/search?query=SU0022'
METHOD = 'https://www.bundesbank.de/resource/blob/621888/2f270cd1c18f9da4aa5e1b41a36b3f40/mL/comparison-of-the-bundesbanks-former-survey-of-lending-data.pdf'
SUD = 'BBIM1.M.DE.B.L21.A.R.A.2250.EUR.N'
REFRESH = argparse.ArgumentParser()
REFRESH.add_argument('--refresh', action='store_true')
refresh = REFRESH.parse_args().refresh
manifest_path = HERE / 'sources.json'
manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}

def download(name, url):
    path = HERE / name
    if refresh or not path.exists():
        with urllib.request.urlopen(url, timeout=90) as response:
            data = response.read()
        path.write_bytes(data)
        manifest[name] = {'url': url, 'downloaded_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'sha256': hashlib.sha256(data).hexdigest()}
    data = path.read_bytes()
    assert hashlib.sha256(data).hexdigest() == manifest[name]['sha256']
    return data

# Resolve against official search metadata, not by constructing a guessed identifier.
search_html = download('official-su0022-search.html', SEARCH).decode('utf-8')
records = [json.loads(m) for m in re.findall(r'\{"id":"[^"]+","flowRef":"[^"]+","key":"[^"]+","title":"[^"]+","type":"BBK_ITS","url":"[^"]+","__typename":"SolrTimeSeries"\}', search_html)]
matches = {r['id']: r for r in records if r['title'].endswith('/ SU0022') and '/ Average interest rate /' in r['title']}
assert len(matches) == 1, matches
SU = next(iter(matches))
(HERE / 'resolved-su0022.json').write_text(json.dumps(matches[SU], indent=2) + '\n')
download('official-methodology.pdf', METHOD)

def monthly(identifier, name):
    flow, key = identifier.split('.', 1)
    raw = download(name, API + flow + '/' + key + '?format=csv&lang=en').decode('utf-8-sig')
    rows = list(csv.reader(io.StringIO(raw)))
    assert rows[0][1] == identifier
    metadata = [r for r in rows if not re.fullmatch(r'\d{4}-\d{2}', r[0])]
    obs = {}
    for row in rows:
        if re.fullmatch(r'\d{4}-\d{2}', row[0]):
            assert row[0] not in obs
            try: value = float(row[1]) / 100
            except ValueError: value = None
            obs[row[0]] = {'rate': value, 'flag': row[2] if len(row) > 2 else ''}
    return obs, metadata

su, su_meta = monthly(SU, 'su0022-official.csv')
sud, sud_meta = monthly(SUD, 'sud101-official.csv')
app_path = ROOT / 'src/features/rentenluecke/model/returnData/historicalProductionData.ts'
app_text = app_path.read_text()
# Snapshot the exact bundled observations, not a refreshed CPI vintage.
app_sha = hashlib.sha256(app_path.read_bytes()).hexdigest()
def parse_year_map(text, field):
    match = re.search(re.escape(field) + r':\s*\{([^}]+)\}', text)
    assert match
    return {int(y): float(v) for y,v in re.findall(r'(\d{4}):\s*([-+\d.eE]+)', match[1])}
cpi = parse_year_map(app_text, 'annualInflation')
equity = parse_year_map(app_text[app_text.index("id: 'jst-r6-developed-equal-weight-equity-real-post1950'"):], 'normalizedSeries')
etf_path = ROOT / 'src/features/rentenluecke/model/returnData/bundledEtfHistoricalReturnData.ts'
etf_text = etf_path.read_text()
etfs = {id_: {int(y):float(v) for y,v in re.findall(r'(\d{4}):\s*([-+\d.eE]+)', block)} for id_, block in re.findall(r"createEtfSeries\('([^']+)', '[^']+', \{([^}]+)\}", etf_text)}
manifest['app_snapshot'] = {'path': str(app_path.relative_to(ROOT)), 'sha256': app_sha, 'generated_at': '2026-08-15T00:00:00.000Z', 'cpi_id': 'bundesbank-destatis-germany-cpi-yoy-annual-mean-post1950', 'equity_id': 'jst-r6-developed-equal-weight-equity-real-post1950', 'etf_file_sha256': hashlib.sha256(etf_path.read_bytes()).hexdigest()}
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
(HERE / 'bundled-app-inputs.json').write_text(json.dumps({'inflation': cpi, 'jst_equity_real': equity, 'etf_nominal': etfs, 'provenance': manifest['app_snapshot']}, indent=2) + '\n')

def write_csv(name, rows):
    assert rows
    with (HERE / name).open('w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader(); writer.writerows(rows)

monthly_rows = []
coverage = []
annual = {}
for label, data in [('SU0022', su), ('SUD101', sud)]:
    first, last = min(data), max(data)
    for year in range(int(first[:4]), int(last[:4])+1):
        keys = [f'{year}-{m:02}' for m in range(1,13)]
        present = [k for k in keys if k in data]
        valid = [k for k in present if data[k]['rate'] is not None]
        missing = [k for k in present if data[k]['rate'] is None]
        coverage.append({'source':label, 'year':year,'rows':len(present),'valid_months':len(valid), 'missing_in_series':';'.join(missing), 'outside_source_span':';'.join(k for k in keys if k not in data), 'complete':len(valid)==12})
        if len(valid)==12: annual[label,year] = statistics.mean(data[k]['rate'] for k in valid)
    # Explicit full calendar month grid within original series span; absent rows distinguished.
    for year in range(int(first[:4]), int(last[:4])+1):
        for m in range(1,13):
            key=f'{year}-{m:02}'
            if first <= key <= last:
                o=data.get(key, {'rate':None,'flag':'ABSENT ROW'})
                monthly_rows.append({'source':label,'series_id':SU if label=='SU0022' else SUD,'month':key,'nominal_annualized_rate':o['rate'],'flag':o['flag']})
write_csv('monthly-observations.csv', monthly_rows)
write_csv('monthly-coverage.csv', coverage)
rows=[]
for year in range(1968, max(y for _,y in annual)+1):
    label='SU0022' if year<=2002 else 'SUD101'
    nominal=annual.get((label,year))
    inflation=cpi.get(year)
    real=(1+nominal)/(1+inflation)-1 if nominal is not None and inflation is not None else None
    rows.append({'year':year,'source':label,'nominal':nominal,'app_inflation':inflation,'real':real,'equity_real':equity.get(year),'included_paired':real is not None,'excluded_reason':'incomplete monthly rate year' if nominal is None else ('app CPI unavailable' if inflation is None else '')})
write_csv('annual-observations.csv',rows)
paired=[r for r in rows if r['included_paired']]
assert all(sum(o['nominal_annualized_rate'] is not None for o in monthly_rows if o['source']==r['source'] and o['month'].startswith(str(r['year'])))==12 for r in paired)

def quantile(values,p):
    s=sorted(values); x=(len(s)-1)*p; lo=math.floor(x); hi=math.ceil(x)
    return s[lo]+(s[hi]-s[lo])*(x-lo)
def corr(a,b):
    if len(a) < 2 or statistics.stdev(a) == 0 or statistics.stdev(b) == 0:
        return None
    return statistics.covariance(a,b)/(statistics.stdev(a)*statistics.stdev(b))
def stats(sample,name):
    n=[r['nominal'] for r in sample]; real=[r['real'] for r in sample]; infl=[r['app_inflation'] for r in sample]
    out={'sample':name,'n':len(sample),'first_year':min(r['year'] for r in sample),'last_year':max(r['year'] for r in sample),'nominal_inflation_correlation':corr(n,infl)}
    for label,values in [('nominal',n),('real',real)]:
        out[label+'_arithmetic_mean']=statistics.mean(values)
        out[label+'_geometric_mean']=math.expm1(statistics.mean(math.log1p(v) for v in values))
        out[label+'_sample_sd']=statistics.stdev(values) if len(values)>1 else None
        out[label+'_negative_share']=sum(v<0 for v in values)/len(values)
        for p in [0,.05,.25,.5,.75,.95,1]:out[label+'_q'+str(p)]=quantile(values,p)
    return out
samples=[('baseline_complete_years',paired),('exclude_transition_2003',[r for r in paired if r['year']!=2003])]
for start,end in [(1968,2002),(2003,2020),(1976,1990),(1991,2002),(2003,2009),(2010,2020)]:
    sample=[r for r in paired if start<=r['year']<=end]
    if sample:samples.append((f'subperiod_{start}_{end}',sample))
for decade in range(1960,2030,10):
    sample=[r for r in paired if decade<=r['year']<decade+10]
    if sample:samples.append((f'decade_{decade}s',sample))
metrics=[stats(s,n) for n,s in samples]
write_csv('statistics.csv',metrics)
rolling=[]
for i in range(len(paired)-9):
    window=paired[i:i+10]
    if window[-1]['year']-window[0]['year']==9:
        rolling.append({'start_year':window[0]['year'],'end_year':window[-1]['year'],'nominal_mean':statistics.mean(r['nominal'] for r in window),'real_mean':statistics.mean(r['real'] for r in window)})
write_csv('rolling-10-year-means.csv',rolling)
overlap=[]
for k in sorted(set(su)&set(sud)):
    if su[k]['rate'] is not None and sud[k]['rate'] is not None:
        overlap.append({'month':k,'su0022':su[k]['rate'],'sud101':sud[k]['rate'],'sud101_minus_su0022':sud[k]['rate']-su[k]['rate']})
write_csv('overlap-2003.csv',overlap)
# Sparse-year sensitivity is NOT the baseline and NOT a complete-year credited-return estimate.
sparse=[]
for year in range(1968,2021):
    data=su if year<=2002 else sud
    vals=[o['rate'] for k,o in data.items() if k.startswith(str(year)) and o['rate'] is not None]
    if vals and year in cpi:
        nominal=statistics.mean(vals)
        sparse.append({'year':year,'valid_months':len(vals),'nominal':nominal,'app_inflation':cpi[year],'real':(1+nominal)/(1+cpi[year])-1})
write_csv('sparse-available-month-sensitivity.csv',sparse)
write_csv('sparse-sensitivity-statistics.csv',[stats(sparse,'NOT_BASELINE_available_month_mean_1968_2020')])
common=[r for r in paired if r['equity_real'] is not None]
write_csv('joint-bootstrap-input.csv',common)
# Empirical resampling only: retain (rate, inflation, equity) tuple and exact year jointly.
rng=random.Random(20261005)
boot=[]
for replicate in range(2000):
    draw=[rng.choice(common) for _ in common]
    boot.append({'replicate':replicate,'n_draws':len(draw),'nominal_mean':statistics.mean(r['nominal'] for r in draw),'inflation_mean':statistics.mean(r['app_inflation'] for r in draw),'real_mean':statistics.mean(r['real'] for r in draw),'equity_real_mean':statistics.mean(r['equity_real'] for r in draw)})
write_csv('joint-bootstrap-mean-replicates.csv',boot)
summary={'resolved_su0022':matches[SU],'metadata':{'SU0022':su_meta,'SUD101':sud_meta},'monthly':{},'cpi':{'n':len(cpi),'first':min(cpi),'last':max(cpi)},'baseline':metrics[0],'exclude_2003':metrics[1],'sparse_sensitivity':stats(sparse,'NOT_BASELINE_available_month_mean'),'overlap':{'n':len(overlap),'mean_difference':statistics.mean(r['sud101_minus_su0022'] for r in overlap)},'rolling':{},'joint_common':{'n':len(common),'first':min(r['year'] for r in common),'last':max(r['year'] for r in common)},'etf_common':{},'bootstrap':{'replicates':len(boot),'seed':20261005,'intervals':{}},'constant_real_re_nominalization':{}}
for label,data in [('SU0022',su),('SUD101',sud)]:
    summary['monthly'][label]={'rows':len(data),'first':min(data),'last':max(data),'valid':sum(o['rate'] is not None for o in data.values()),'missing_values':sum(o['rate'] is None for o in data.values()),'nonempty_flags':{k:o['flag'] for k,o in data.items() if o['flag']},'complete_annual_years':[y for l,y in annual if l==label]}
for field in ['nominal_mean','real_mean']:
    values=[r[field] for r in rolling]
    summary['rolling'][field]={'n':len(values),'min':min(values),'max':max(values),'range':max(values)-min(values),'minimum_window':next(r for r in rolling if r[field]==min(values)),'maximum_window':next(r for r in rolling if r[field]==max(values))}
for id_,series in etfs.items():
    years=sorted(r['year'] for r in paired if r['year'] in series)
    summary['etf_common'][id_]={'n':len(years),'years':years}
for field in ['nominal_mean','real_mean','inflation_mean','equity_real_mean']:
    values=[r[field] for r in boot]
    summary['bootstrap']['intervals'][field]={'p025':quantile(values,.025),'p975':quantile(values,.975)}
for field in ['real_arithmetic_mean','real_geometric_mean']:
    constant=metrics[0][field]
    re_nom=[{'year':y,'nominal':(1+constant)*(1+v)-1} for y,v in sorted(cpi.items())]
    summary['constant_real_re_nominalization'][field]={'constant':constant,'negative_years':[r for r in re_nom if r['nominal']<0],'minimum':min(r['nominal'] for r in re_nom)}
(HERE/'results.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({k:v for k,v in summary.items() if k not in ['monthly','metadata','constant_real_re_nominalization']},indent=2))
print('Monthly summaries:', {k:{a:b for a,b in v.items() if a not in ['nonempty_flags','complete_annual_years']} for k,v in summary['monthly'].items()})
print('Wrote verified research outputs under',HERE)

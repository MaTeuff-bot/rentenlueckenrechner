# Tagesgeld: rationale for a constant nominal 2% planning scenario

Research checked: **5 October 2026**. Scope: evidence and recommendation only; no default, configuration, calculation, variable-rate model or inflation model changes.

## Delivery status

This initial rationale was expanded into [composite deposit research](research/tagesgeld-composite/FOLLOWUP.md), whose feature shipped in [PR #86](https://github.com/MaTeuff-bot/rentenlueckenrechner/pull/86). Production now offers historical joint deposit bootstrap and a real-target assumption with a disclosed nominal zero floor alongside the existing explicitly confirmed constant-nominal 2% proposal/default. The research did not calibrate 2% as a forecast; the recommendation below remains valid as scenario labeling, not an outstanding prerequisite or instruction to change defaults. See the [implemented rule snapshot](tagesgeld-planzins-rules-2026.md).

## Recommendation

**A constant nominal 2% p.a. rate is defensible as an explicitly chosen planning scenario, but the evidence reviewed does not establish it as an empirically justified long-term default.** Its rationale is a transparent, reproducible “what if” calculation—not a calibrated expectation of future Tagesgeld returns. Keep the existing default unchanged pending a separate product decision.

Suggested wording:

> “For this scenario, interest is assumed to remain at 2% nominal per year throughout the projection. This is a simplifying planning assumption, not a forecast, guaranteed bank offer or empirically validated long-term average. Actual Tagesgeld rates can differ.”

Do not describe 2% as “conservative”, “the Bundesbank average”, “the ECB rate” or “validated by current offers”. State the calculator's existing tax/fee treatment separately: **nominal does not itself mean net of tax or fees**.

## What the primary evidence establishes

| Measure | Verified observation | Relevance and limitation |
| --- | --- | --- |
| German banks: household overnight deposits, Bundesbank **SUD101**, series `BBIM1.M.DE.B.L21.A.R.A.2250.EUR.N` | **August 2026: 0.51% p.a., provisional**; source updated **1 October 2026**.[1] | The metadata explicitly describe a volume-weighted average of the outstanding stock at month-end, despite the “new business” label. It is not a ranking of newly advertised Tagesgeld accounts.[1] |
| Euro-area banks: household overnight deposits | **August 2026: 0.29% p.a.**, published **1 October 2026**.[2] | A different geographic aggregate; it must not be substituted for the German observation. The same release reports **2.13%** for new household deposits with agreed maturity up to one year: a different deposit category, not Tagesgeld.[2] |
| ECB deposit facility | **2.50%**, effective **16 September 2026**, announced **10 September 2026**.[3] | This is remuneration for banks' overnight deposits with the Eurosystem, not an interest rate households are entitled to receive from their bank.[4] |

The household overnight aggregate is broader than an actively selected interest-paying Tagesgeld account: Bundesbank educational material identifies current-account balances as sight deposits and sight deposits as payable daily.[5] Consequently, the low aggregate is useful context but neither a direct estimate of the best attainable Tagesgeld rate nor, by itself, a reason to replace the model's input.

Pass-through is not a fixed identity. The ECB's **May 2026 Financial Stability Review**, section 3.1, discusses competition and differences between banking markets and notes that overnight deposit rates are less sensitive to interest-rate changes than variable lending rates.[6] A household return cannot therefore be inferred mechanically from the policy rate.

## Why snapshots and promotions cannot validate a long-term rate

- **A current level is not a multi-decade expectation.** The ECB's September decision explicitly says it is data-dependent, meeting-by-meeting and “not pre-committing to a particular rate path”.[3] Extrapolating its current policy rate into a permanent household return is unsupported.
- **The same German series has materially different historical observations:** December 2021 **−0.01%**, December 2023 **0.60%**, and December 2024 **0.56%**.[1] These selected observations illustrate variation; they are not a calibration sample, historical-average estimate or proposed forecast.
- **Promotional-offer limitation (methodological):** for any offer conditional on a promotional period, eligible customer status, new money or a balance cap, the advertised annual rate applies only within those conditions. It cannot establish an unchanged return for the whole horizon and balance. A scenario must not silently assume repeated eligibility or successful account switching. No bank promotion, prevailing promotional level or typical promotional duration was verified or used to justify 2% here.
- **The ECB's 2% inflation target is not a deposit-return target.** The September decision describes it as an inflation objective; the methodology distinguishes nominal interest from purchasing-power-adjusted interest.[3][4] Numerical similarity is not evidence for this nominal return assumption, and no inflation model is recommended.

## Illustrative sensitivity, not forecasts

Recommend comparing separate runs at **0%, 1%, 2% and 3% nominal p.a.**, holding each rate constant for the entire run and all other inputs unchanged. These are illustrative scenario inputs only—not forecasts, probability assignments, confidence bounds, guaranteed yields or an exhaustive range of possible outcomes. The 2% case has no evidence-derived privileged status.

**Decision boundary:** this research supports honest scenario labelling and sensitivity checks. It does **not** substantiate changing the default to 2%. An empirical-default claim would require a separately documented methodology matching the intended savings behaviour and projection horizon; none was established here.

## Sources

All URLs below were retrieved; values and dates above were checked against the official page or Bundesbank CSV, not search snippets.

[1] Deutsche Bundesbank, SUD101 CSV, including methodology and observation flags: https://api.statistiken.bundesbank.de/rest/data/BBIM1/M.DE.B.L21.A.R.A.2250.EUR.N?format=csv&lang=de

[2] ECB, *Euro area bank interest rate statistics: August 2026*, 1 October 2026: https://www.ecb.europa.eu/press/stats/mfi/html/ecb.mir2610~8e4898ad10.en.html

[3] ECB, *Monetary policy decisions*, 10 September 2026: https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp260910~314e508016.en.html

[4] ECB Data Portal, *What are interest rates?*: https://data.ecb.europa.eu/methodology/what-are-interest-rates

[5] Deutsche Bundesbank, *Geld und Geldpolitik*, chapter 3, *Banken und Buchgeld*: https://publikationen.bundesbank.de/content/922604

[6] ECB, *Financial Stability Review, May 2026*, section 3.1: https://www.ecb.europa.eu/press/financial-stability-publications/fsr/html/ecb.fsr202605~50566915a7.en.html

# Legal verification — narrow simulation convention (no new legal rule)

Approved Defect A is a simulation-only convention: a sampled/historical cash-proxy decline is
balance-only and is not proof of a deductible fee, negative assessable interest, or realised default.
Positive modelled deposit income remains interest once. Actual documented custody fees/defaults need
distinct evidence and are outside this change. Valid fund-loss paths, the saver allowance/manual
fallback, and the €51 expense allowance are preserved.

Official sources (coordinator-verified 2026-09-18; implementation follows these boundaries):

- EStG §20 Abs.1 Nr.7, Abs.2, Abs.6, Abs.9 — https://www.gesetze-im-internet.de/estg/__20.html
  Interest is taxable; capital losses require the relevant legal events; actual expenses are excluded
  under the saver allowance. A proxy decline alone is not proof of a deductible event.
- BMF 14.05.2025 Einzelfragen zur Abgeltungsteuer, Rn129a, p59 —
  https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Abgeltungsteuer/2025-05-14-einzelfragen-zur-abgeltungsteuer.pdf?__blob=publicationFile&v=6
  Actual negative deposit interest is not interest under §20 Abs.1 Nr.7; economically it is a
  custody/deposit fee covered by §20 Abs.9 saver allowance. Tiered products: overall positive interest
  is taxable, overall negative is a fee. This supports no automatic tax-loss fiction, but it is NOT proof
  that sampled proxy losses equal contractual fees.
- GKV Einheitliche Grundsätze zur Beitragsbemessung freiwilliger Mitglieder, effective 2025-01-01,
  §3 Abs.1b, p4 —
  https://www.gkv-spitzenverband.de/media/dokumente/krankenversicherung_1/grundprinzipien_1/finanzierung/beitragsbemessung/2025-01-01_Einheitliche_Grundsaetze_zur_Beitragsbemessung_freiwilliger_Mitglieder_Stand_01_01_2025.pdf
  Explicit €51 annual expense allowance unless higher actual expenses are evidenced; loss offsets refer
  to §20 Abs.6. Do NOT claim actual documented custody expenses can never affect GKV.
- GKV Einnahmen-Katalog 2026-05-26, p30/p15 —
  https://www.gkv-spitzenverband.de/media/dokumente/krankenversicherung_1/grundprinzipien_1/finanzierung/beitragsbemessung/2026-05-26_Katalog_Einnahmen_beitragsrechtliche_Bewertung_240_SGB_V_BF.pdf
  `Zinsen aus Kapitalvermögen` are assessable investment income.

Implementation disclosure (UI + docs):

- Historical/synthetic cash proxy, not a contractual savings-account forecast.
- Negative modelled value movement reduces bank wealth with no automatic tax loss and no GKV negative income.
- Individual actual custody fees or realised claim defaults require distinct evidence and are not inferred.
- Do not generalise beyond this narrow distinction.

/* global localStorage, document, innerWidth */
import process from 'node:process'
// Run with PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/verifyInsuranceEstimatorBrowser.mjs
// Against a local Vite server; creates only local browser evidence, never publishes.
import { writeFile } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--no-sandbox'] })
const baseURL = process.env.ESTIMATOR_BASE_URL ?? 'http://127.0.0.1:5175'
const evidence = []
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 } })
    const page = await context.newPage()
    page.setDefaultTimeout(60000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const streams = [{ id: 'pension', name: 'Rente', kind: 'gesetzliche-rente', amountMonthlyToday: 2000, startAge: 67, endAge: null, amountBasis: 'gross', deductionMode: 'none', effectiveDeductionRate: 0, support: 'standard' }]
    const saved = { version: 13, input: {
      currentAge: 65, retirementAge: 65, planningAge: 69, currentCapital: 100000,
      monthlyContributionToday: 100, monthlyDesiredSpendingToday: 2500, monthlyRetirementIncomeToday: 2000,
      annualInflationRate: .02, annualReturnBeforeRetirement: .07, annualReturnInRetirement: .07,
      retirementIncomeStreams: streams, retirementInsurance: {
        referenceYear: 2026, pensionAge: 67, insurerAdditionalRate: .029, isParent: false, childBirthYears: [],
        bridge: { status: 'voluntary', circumstances: 'standard' },
        pension: { status: 'unknown', circumstances: 'standard', drvSubsidy: 'not-received' },
      },
    }, retirementIncomeStreams: streams,
    portfolioBuckets: [{ id: 'fund', name: 'Depot', value: 100000, annualCostRate: 0, returnSeriesId: 'synthetic-equity-assumption-v1' }],
    historical: { inflationSourceId: 'fixed-manual' } }
    await page.addInitScript(value => {
      if (!localStorage.getItem('browser-fixture-loaded')) {
        localStorage.setItem('rentenlueckenrechner.scenario.v13', JSON.stringify(value))
        localStorage.setItem('browser-fixture-loaded', '1')
        localStorage.setItem('unrelated-browser-value', 'keep')
      }
    }, saved)
    await page.goto(baseURL)
    const forecast = page.getByRole('heading', { name: 'Monatliche KV/PV-Aufschlüsselung' })
    const requireState = async (condition, message) => { if (!await condition()) throw new Error(message) }
    await page.getByLabel('Kapitalbasis – Brücke').waitFor()
    await requireState(async () => await forecast.count() === 0, 'Incomplete setup showed forecast')
    await page.getByLabel('Tatsächliche Anlageart von Depot').selectOption('accumulating-equity-fund')
    await page.getByLabel('Anschaffungskosten des gesamten Fondspools (€)', { exact: true }).fill('0')
    await page.getByLabel(/Anlageumfang bestätigt/).check()
    await page.getByLabel(/Verlustumfang bestätigt/).check()
    await forecast.waitFor()
    await page.getByText('Konservative Annahme: freiwillige GKV. Kein garantierter Höchstbeitrag. Die App prüft keine KVdR-Berechtigung.', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Erstes Brückenjahr' }).click()
    await requireState(async () => await page.getByLabel('Berechnungsjahr auswählen').inputValue() === '65', 'Bridge boundary')
    await page.getByRole('button', { name: 'Erstes Rentenjahr' }).click()
    await requireState(async () => await page.getByLabel('Berechnungsjahr auswählen').inputValue() === '67', 'Pension boundary')
    await page.getByText('Automatische Kapitalbasis – Jahreswerte', { exact: true }).click()
    await page.getByText('Erweitert – projizierter Basiszins', { exact: true }).click()
    await requireState(async () => await page.getByLabel('Konstanter nominaler Basiszins (%)').inputValue() === '3.2', 'Basis rate default')
    await page.getByLabel('Anschaffungskosten des gesamten Fondspools (€)', { exact: true }).fill('')
    await requireState(async () => await forecast.count() === 0, 'Missing cost showed forecast')
    await page.getByLabel('Tatsächliche Anlageart von Depot').selectOption('unsupported')
    await page.getByLabel('Kapitalbasis – Brücke').selectOption('manual')
    await page.getByLabel('Beitragsrelevante Kapitalerträge – Brücke (€/Monat heute)').fill('100')
    await requireState(async () => await forecast.count() === 0, 'Other automatic phase bypassed gate')
    await page.getByLabel('Kapitalbasis – Rentenphase').selectOption('manual')
    await page.getByLabel('Beitragsrelevante Kapitalerträge – Rentenphase (€/Monat heute)').fill('0')
    await forecast.waitFor()
    await requireState(async () => await page.getByLabel('Tatsächliche Anlageart von Depot').inputValue() === 'unsupported', 'Portfolio altered by manual choice')
    await page.reload()
    await forecast.waitFor()
    await requireState(async () => await page.getByLabel('Beitragsrelevante Kapitalerträge – Brücke (€/Monat heute)').inputValue() === '100', 'Manual estimate not persisted')
    await page.getByLabel('Tatsächliche Anlageart von Depot').selectOption('accumulating-equity-fund')
    await page.getByLabel('Kapitalbasis – Brücke').selectOption('automatic')
    await page.getByLabel('Anschaffungskosten des gesamten Fondspools (€)', { exact: true }).fill('30000')
    await forecast.waitFor()
    await page.getByRole('button', { name: 'Erstes Brückenjahr' }).click()
    await page.getByText('Automatische Kapitalbasis – Jahreswerte', { exact: true }).click()
    await forecast.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `docs/verification/insurance-estimator-${width}.png`, fullPage: true })
    await page.getByRole('spinbutton', { name: /Gewünschte monatliche Ausgaben im Ruhestand/ }).fill('100000')
    await page.getByRole('alert').filter({ hasText: 'Vermögenslücke' }).waitFor()
    await page.getByRole('region', { name: 'Monatliche KV/PV-Aufschlüsselung' }).screenshot({ path: `docs/verification/insurance-estimator-shortfall-${width}.png` })
    await page.getByLabel('Tatsächliche Anlageart von Depot').selectOption('ordinary-bank-deposit')
    await requireState(async () => await forecast.count() === 0, 'Bank non-interest source was accepted')
    await page.getByLabel('Renditequelle/Proxy von Depot').selectOption('synthetic-cash-assumption-v1')
    await page.getByRole('status').filter({ hasText: 'Berechnung unvollständig: Negative bank return' }).waitFor()
    await requireState(async () => await forecast.count() === 0, 'Failed bank path showed a complete forecast')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    const unrelatedPreserved = await page.evaluate(() => localStorage.getItem('unrelated-browser-value') === 'keep')
    if (errors.length || overflow || !unrelatedPreserved) throw new Error(JSON.stringify({ errors, overflow, unrelatedPreserved }))
    evidence.push({ width, passed: true, errors, overflow, unrelatedPreserved, checks: ['missing classification/cost', 'explicit zero', 'scope declarations', 'automatic forecast', 'unknown label', 'phase navigation', 'basis rate', 'manual phase independence', 'unsupported portfolio intact', 'reload persistence', 'assessment breakdown', 'funding shortfall', 'bank source gate', 'negative gross bank path error'] })
    await context.close()
  }
  await writeFile('docs/verification/insurance-estimator-browser.json', JSON.stringify({ testedAt: new Date().toISOString(), baseURL, evidence }, null, 2) + '\n')
} finally { await browser.close() }

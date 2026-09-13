/* global localStorage, document, innerWidth */
// Local-only verification. Install Playwright outside the source tree or provide PLAYWRIGHT_MODULE.
// PR2_BASE_URL points to an already running local Vite server. PR2_EVIDENCE_DIR receives artifacts.
import process from 'node:process'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const baseURL = process.env.PR2_BASE_URL ?? 'http://127.0.0.1:5177/rentenlueckenrechner/'
const output = process.env.PR2_EVIDENCE_DIR ?? 'docs/verification/insurance-pr2-browser'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--no-sandbox', ...(process.env.PR2_LOW_PROCESS_MODE === '1' ? ['--single-process', '--no-zygote'] : [])] })
const evidence = []
const storageKey = 'rentenlueckenrechner.scenario.v15'
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 } })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    const checkpoints = []
    const check = async name => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `Overflow at ${width}: ${name}`)
      assert.deepEqual(errors, [], `Browser errors at ${name}`)
      checkpoints.push(name)
      process.stdout.write(`${width}: ${name}\n`)
    }
    const insurance = page.getByRole('group', { name: 'Kranken- und Pflegeversicherung', exact: true })
    const group = name => page.getByRole('group', { name, exact: true })
    const forecast = page.getByRole('heading', { name: 'Monatliche KV/PV-Aufschlüsselung' })
    const noForecast = async () => assert.equal(await page.getByText('KV/PV-Abrechnung im Detail', { exact: true }).count(), 0)
    const ready = async () => { const disclosure = page.getByText('KV/PV-Abrechnung im Detail', { exact: true }); await disclosure.waitFor(); if (!await disclosure.evaluate(el => el.parentElement.open)) await disclosure.click(); await forecast.waitFor({ state: 'visible' }) }
    await page.goto(baseURL)
    await noForecast()
    await page.locator('#currentAge').fill('65')
    await page.locator('#planningAge').fill('70')
    await page.locator('#insurance-pension-status').selectOption('kvdr')
    await group('Besondere Umstände – Rentenphase').getByLabel('Nichts davon', { exact: true }).check()
    await page.locator('#retirement-income-support-statutory-pension').selectOption('standard')
    await page.locator('#insurance-insurerAdditionalRate').fill('2.9')
    await page.getByRole('button', { name: 'Keine anerkannten Kinder', exact: true }).click()
    await ready()
    assert.equal(await page.locator('#insurance-pension-summary').count(), 0) // summaries use test IDs, never duplicate control IDs
    assert.match(await page.getByTestId('insurance-pension-summary').innerText(), /^KVdR · automatisch$/)
    await check('fresh setup completed through controls: KVdR')
    await page.locator('#retirementAge').fill('65')
    await page.locator('#insurance-bridge-status').selectOption('voluntary')
    assert.equal(await page.locator('#insurance-bridge-status option[value="kvdr"]').count(), 0)
    await page.getByRole('button', { name: 'Angaben aus der anderen Phase übernehmen – Brücke', exact: true }).click()
    assert.equal(await group('Zusätzlich in der Brücke').getByLabel('Nichts davon', { exact: true }).isChecked(), false)
    await noForecast()
    // The missing bridge-only issue jumps to its real checkbox.
    await page.locator('a[href="#insurance-bridge-bridgeOnly"]').first().click()
    assert.equal(await page.evaluate(() => document.activeElement.id), 'insurance-bridge-bridgeOnly')
    await group('Zusätzlich in der Brücke').getByLabel('Nichts davon', { exact: true }).check()
    await page.locator('#insurance-bridge-capitalMode').selectOption('manual')
    await page.locator('#insurance-bridge-capitalMonthlyToday').fill('0')
    await ready()
    assert.equal(await page.locator('#insurance-insurerAdditionalRate').count(), 1)
    assert.equal(await page.locator('#children-none').count(), 1)
    await check('bridge range, no KVdR, copy leaves bridge-only unanswered, focus and explicit zero')
    await group('Brücke · Alter 65 bis unter 67').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${output}/insurance-pr2-automatic-${width}.png` })
    await page.locator('#insurance-pension-status').selectOption('unknown')
    assert.equal(await page.locator('#insurance-pension-drvSubsidy').inputValue(), '')
    await noForecast()
    for (const select of await page.locator('select[id^="portfolio-holding-"]').all()) await select.selectOption('accumulating-equity-fund')
    await page.locator('#estimator-fundAcquisitionCost').fill('0')
    await page.locator('#estimator-scopeConfirmed').check()
    await page.locator('#estimator-lossScopeConfirmed').check()
    await page.locator('#insurance-pension-drvSubsidy').selectOption('confirmed')
    await ready()
    await check('unknown voluntary assumption, automatic portfolio estimator, explicit subsidy')
    // A disclosure-bound invalid field must expand when its issue link is followed.
    await page.getByText('Erweitert – projizierter Basiszins', { exact: true }).click()
    await page.locator('#estimator-projectedBasisRate').fill('101')
    await page.getByText('Erweitert – projizierter Basiszins', { exact: true }).click()
    await page.locator('a[href="#estimator-projectedBasisRate"]').first().click()
    assert.equal(await page.evaluate(() => document.activeElement.id), 'estimator-projectedBasisRate')
    assert.equal(await page.locator('#estimator-projectedBasisRate').isVisible(), true)
    await page.locator('#estimator-projectedBasisRate').fill('3.2')
    await ready()
    await page.locator('#insurance-pension-manual').check()
    assert.equal(await page.locator('#insurance-pension-drvSubsidy').count(), 0)
    await page.locator('#insurance-pension-kvMonthlyToday').fill('0')
    await page.locator('#insurance-pension-pvMonthlyToday').fill('25')
    await ready()
    assert.match(await page.getByTestId('insurance-pension-summary').innerText(), /KV 0 \/ PV 25/)
    await page.locator('#insurance-pension-kvMonthlyToday').fill('')
    await noForecast()
    await page.locator('#insurance-pension-kvMonthlyToday').fill('0')
    await page.getByRole('button', { name: /Zur automatischen Berechnung zurückkehren/ }).click()
    await ready()
    assert.equal(await page.locator('#insurance-pension-manual').isChecked(), false)
    assert.equal(await page.locator('#insurance-pension-drvSubsidy').inputValue(), 'confirmed')
    assert.equal(await page.locator('#estimator-fundAcquisitionCost').inputValue(), '0')
    await check('manual whole-phase zero vs missing, automatic roundtrip, retained estimator/subsidy, disclosure focus')
    await group('Besondere Umstände – Brücke').getByLabel('Krankengeld', { exact: true }).check()
    await group('Besondere Umstände – Brücke').getByLabel('Mehrere Personen', { exact: true }).check()
    await page.getByRole('button', { name: 'Angaben aus der anderen Phase übernehmen – Rentenphase', exact: true }).click()
    assert.equal(await group('Besondere Umstände – Rentenphase').getByLabel('Krankengeld', { exact: true }).isChecked(), true)
    assert.equal(await page.locator('#insurance-insurerAdditionalRate').count(), 0)
    await page.locator('#insurance-bridge-kvMonthlyToday').fill('100')
    await page.locator('#insurance-bridge-pvMonthlyToday').fill('20')
    await ready()
    await check('multiple exceptions and reverse copy; shared controls absent with both phases manual')
    await page.screenshot({ path: `${output}/insurance-pr2-${width}.png`, fullPage: true })
    await page.reload()
    await ready()
    assert.equal(await group('Besondere Umstände – Brücke').getByLabel('Mehrere Personen', { exact: true }).isChecked(), true)
    await check('v15 coverage, amounts and forecast survive reload')
    await page.getByRole('button', { name: '+ Einkommen hinzufügen', exact: true }).click()
    const lateId = await page.locator('input[id^="retirement-income-name-"]').last().getAttribute('id')
    const streamId = lateId.replace('retirement-income-name-', '')
    await page.locator(`#retirement-income-start-${streamId}`).fill('69')
    // Clear coverage exceptions to prove income alone keeps whole-phase manual.
    await group('Besondere Umstände – Brücke').getByLabel('Nichts davon', { exact: true }).check()
    assert.equal(await insurance.getByText(/Weiteres Einkommen ab Alter 69/).count(), 1)
    await insurance.getByRole('button', { name: 'Einkommen bearbeiten', exact: true }).click()
    assert.equal(await page.evaluate(() => document.activeElement.id), `retirement-income-kind-${streamId}`)
    await check('late unsupported income named early and editable')
    // Removing the statutory stream requires an explicit insurance transition.
    await page.getByRole('button', { name: 'Gesetzliche Rente entfernen', exact: true }).click()
    await noForecast()
    assert.equal(await insurance.locator('select[id$="-status"]').count(), 0)
    await page.locator('#insurance-transition').fill('67')
    assert.equal(await group('Phase ab Versicherungsübergang · Alter 67 bis unter 70').count(), 1)
    await check('no statutory income: explicit transition and phase wording')
    // Two statutory dates in reverse date order: the second controls the transition.
    await page.locator(`#retirement-income-kind-${streamId}`).selectOption('gesetzliche-rente')
    await page.getByRole('button', { name: '+ Einkommen hinzufügen', exact: true }).click()
    const earlierId = (await page.locator('input[id^="retirement-income-name-"]').last().getAttribute('id')).replace('retirement-income-name-', '')
    await page.locator(`#retirement-income-kind-${earlierId}`).selectOption('gesetzliche-rente')
    await page.locator(`#retirement-income-start-${earlierId}`).fill('66')
    await insurance.getByRole('button', { name: 'Zeitplan ergänzen / korrigieren', exact: true }).click()
    assert.equal(await page.evaluate(() => document.activeElement.id), `retirement-income-start-${earlierId}`)
    for (const invalid of ['', '66.5']) {
      await page.locator(`#retirement-income-start-${earlierId}`).fill(invalid)
      await noForecast()
      await page.locator(`.validation-summary a[href="#retirement-income-start-${earlierId}"]`).first().click()
      assert.equal(await page.evaluate(() => document.activeElement.id), `retirement-income-start-${earlierId}`)
    }
    await page.locator(`#retirement-income-start-${earlierId}`).fill('66')
    await check('earliest statutory date despite array order; missing and invalid date links focus live controls')
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey)
    saved.portfolioBuckets[0].value = 123456
    saved.input.monthlyContributionToday = 987
    saved.input.monthlyDesiredSpendingToday = 4321
    await context.close()
    // Separate fresh context: complete old scenario is reset, no migration; foreign/newer keys stay.
    const resetContext = await browser.newContext({ viewport: { width, height: 844 } })
    const resetPage = await resetContext.newPage()
    await resetPage.addInitScript(value => {
      if (!localStorage.getItem('reset-seeded')) {
        localStorage.setItem('rentenlueckenrechner.scenario.v14', JSON.stringify({ ...value, version: 14 }))
        localStorage.setItem('foreign', 'keep')
        localStorage.setItem('rentenlueckenrechner.scenario.v16', 'keep')
        localStorage.setItem('reset-seeded', 'yes')
      }
    }, saved)
    await resetPage.goto(baseURL)
    await resetPage.getByRole('button', { name: 'Hinweis schließen', exact: true }).waitFor()
    assert.equal(await resetPage.locator('#currentAge').inputValue(), '40')
    assert.equal(await resetPage.locator('#insurance-pension-status').inputValue(), '')
    const resetState = await resetPage.evaluate(() => ({ old: localStorage.getItem('rentenlueckenrechner.scenario.v14'), foreign: localStorage.getItem('foreign'), newer: localStorage.getItem('rentenlueckenrechner.scenario.v16') }))
    assert.deepEqual(resetState, { old: null, foreign: 'keep', newer: 'keep' })
    const fresh = await resetPage.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey)
    assert.equal(fresh.version, 15)
    assert.equal(fresh.input.monthlyContributionToday, 500)
    assert.equal(fresh.input.monthlyDesiredSpendingToday, 3000)
    assert.equal(fresh.portfolioBuckets.some(bucket => bucket.value === 123456 || bucket.holding), false)
    assert.equal(fresh.retirementIncomeStreams[0].kind, 'gesetzliche-rente')
    assert.equal(fresh.childrenAnswer.kind, 'missing')
    assert.deepEqual(fresh.insuranceCoverageAnswers, { bridge: { common: { kind: 'missing' }, bridgeOnly: { kind: 'missing' } }, pension: { common: { kind: 'missing' } } })
    await resetPage.getByRole('button', { name: 'Hinweis schließen', exact: true }).click()
    await resetPage.reload()
    assert.equal(await resetPage.getByRole('button', { name: 'Hinweis schließen', exact: true }).count(), 0)
    await resetContext.close()
    checkpoints.push('v14 complete scenario reset, defaults restored, foreign/newer preserved, notice dismissal persists')
    evidence.push({ width, checkpoints, errors })
    await writeFile(`${output}/browser-results.json`, JSON.stringify(evidence, null, 2))
  }
  process.stdout.write(`${JSON.stringify({ status: 'passed', evidence }, null, 2)}\n`)
} catch (error) {
  await writeFile(`${output}/browser-failure.txt`, String(error.stack ?? error))
  for (const [index, page] of browser.contexts().flatMap(context => context.pages()).entries()) {
    await page.screenshot({ path: `${output}/failure-${index}.png`, fullPage: true }).catch(() => {})
    await writeFile(`${output}/failure-${index}.html`, await page.content().catch(() => 'Page unavailable'))
  }
  throw error
} finally {
  await browser.close()
}

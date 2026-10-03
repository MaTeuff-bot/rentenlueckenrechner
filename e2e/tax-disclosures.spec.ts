import { expect, test } from '@playwright/test'

import { expectPensionTaxLimitation, freshLoad, openTaxNotes, setupFundOnlyBridge } from './fixtures'

test('results show truthful tax copy with expandable exclusions and detailed notes', async ({ page }) => {
  await freshLoad(page)
  await setupFundOnlyBridge(page)

  const results = page.locator('#ergebnis')

  await expect(results.getByText(/Kapitalertragsteuer und GRV-Rentensteuer werden als Planungsnäherung/)).toBeVisible()
  await expect(results.getByText(/Investmentsteuern werden nicht/)).toHaveCount(0)

  const exclusionsSummary = results.getByText('Hinweise zu Ausschlüssen und Annahmen', { exact: true })
  const exclusions = results.locator('details:has(summary:text("Hinweise zu Ausschlüssen und Annahmen"))')
  await exclusionsSummary.click()
  await expect(exclusions).toBeVisible()
  await expect(exclusions.getByText(/Nicht modelliert: Riester/)).toBeVisible()
  await expect(exclusions.getByText(/ohne Verkaufsgewinn modelliert/)).toBeVisible()

  await openTaxNotes(page)
  await expectPensionTaxLimitation(page)
})
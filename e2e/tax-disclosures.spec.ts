import { expect, test } from '@playwright/test'

import { expectPensionTaxLimitation, freshLoad, openTaxNotes, setupFundOnlyBridge } from './fixtures'

test('results show truthful tax copy with existing detailed notes', async ({ page }) => {
  await freshLoad(page)
  await setupFundOnlyBridge(page)

  const results = page.locator('#ergebnis')

  await expect(results.getByText(/Kapitalertragsteuer und GRV-Rentensteuer werden als Planungsnäherung/)).toBeVisible()
  await expect(results.getByText(/Investmentsteuern werden nicht/)).toHaveCount(0)
  await expect(results.getByText('Hinweise zu Ausschlüssen und Annahmen', { exact: true })).toHaveCount(0)
  await expect(results.getByText('Hinweise zur Renten- und Kapitalertragsteuer', { exact: true })).toHaveCount(1)

  await openTaxNotes(page)
  const taxNotes = results.locator('details:has(summary:text("Hinweise zur Renten- und Kapitalertragsteuer"))')
  await expect(taxNotes.getByText(/Nicht modelliert: Riester/)).toBeVisible()
  await expect(taxNotes.getByText(/kein Verkaufsgewinn/)).toBeVisible()
  await expectPensionTaxLimitation(page)
})
/* global console, fetch */

import { mkdir, writeFile } from 'node:fs/promises'

const ENDPOINT =
  'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/demo_mlifetable?geo=DE&time=2024&indic_de=PROBDEATH&lang=en'

const sexes = [
  ['male', 'M'],
  ['female', 'F'],
  ['total', 'T'],
]

function ageCodeToAge(ageCode) {
  if (ageCode === 'Y_LT1') return 0
  if (ageCode === 'Y_GE95') return 95

  const match = /^Y(\d+)$/.exec(ageCode)
  return match ? Number(match[1]) : null
}

async function fetchSex(sexCode) {
  const response = await fetch(`${ENDPOINT}&sex=${sexCode}`)

  if (!response.ok) {
    throw new Error(`Eurostat request failed for sex=${sexCode}: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  const ageIndex = data.dimension.age.category.index
  const byAge = new Map()

  for (const [ageCode, index] of Object.entries(ageIndex)) {
    const age = ageCodeToAge(ageCode)
    const qx = data.value[index]

    if (age === null || typeof qx !== 'number') continue

    byAge.set(age, qx)
  }

  return byAge
}

const tables = new Map()

for (const [sexName, sexCode] of sexes) {
  tables.set(sexName, await fetchSex(sexCode))
}

const ages = [...tables.get('total').keys()].sort((a, b) => a - b)
const rows = ages.map((age) => ({
  age,
  qxMale: tables.get('male').get(age),
  qxFemale: tables.get('female').get(age),
  qxTotal: tables.get('total').get(age),
}))

const missing = rows.filter((row) =>
  [row.qxMale, row.qxFemale, row.qxTotal].some((value) => typeof value !== 'number'),
)

if (missing.length > 0) {
  throw new Error(`Missing qx values for ages: ${missing.map((row) => row.age).join(', ')}`)
}

const sourceUrls = sexes.map(([, sexCode]) => `${ENDPOINT}&sex=${sexCode}`)
const content = `import type { MortalityAgeRow } from './mortality'

export const EUROSTAT_GERMANY_LIFE_TABLE_2024_SOURCE = {
  dataset: 'Eurostat demo_mlifetable',
  indicator: 'PROBDEATH',
  geo: 'DE',
  time: '2024',
  sourceUrls: ${JSON.stringify(sourceUrls, null, 2)},
  note: 'Eurostat provides an open terminal age group Y_GE95; survival probabilities above exact age 95 are capped.',
} as const

export const EUROSTAT_GERMANY_LIFE_TABLE_2024: MortalityAgeRow[] = ${JSON.stringify(rows, null, 2)}
`

await mkdir('src/features/rentenluecke/mortality', { recursive: true })
await writeFile('src/features/rentenluecke/mortality/eurostatGermanyLifeTable2024.ts', content)

console.log(`Wrote ${rows.length} rows to src/features/rentenluecke/mortality/eurostatGermanyLifeTable2024.ts`)

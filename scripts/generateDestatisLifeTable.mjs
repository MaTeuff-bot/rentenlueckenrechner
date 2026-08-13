import { writeFile } from 'node:fs/promises'
import process from 'node:process'

const SOURCE_URL = 'https://genesis.destatis.de/genesisWS/inspire/pd/00/features/12621-0001.xml'
const OUTPUT_PATH = 'src/features/rentenluecke/mortality/destatisGermanyPeriodLifeTable2023_2025.ts'

const response = await globalThis.fetch(SOURCE_URL)

if (!response.ok) {
  throw new Error(`Failed to fetch Destatis life table: ${response.status} ${response.statusText}`)
}

const xml = await response.text()

function getDistributionsByMeasure(sourceXml, measureNamePart) {
  const distributionRegex = /<pd:StatisticalDataDistribution[\s\S]*?<\/pd:StatisticalDataDistribution>/g
  return [...sourceXml.matchAll(distributionRegex)]
    .map((match) => match[0])
    .filter((distribution) => distribution.includes(measureNamePart))
}

function parseAge(code) {
  const match = code.match(/ALTVOLL(\d{3})/)
  return match ? Number(match[1]) : null
}

function parseValues(distributions, valueType) {
  const values = new Map()
  const valueRegex = /<pd:StatisticalDataValue>[\s\S]*?<\/pd:StatisticalDataValue>/g

  for (const distribution of distributions) {
    for (const match of distribution.matchAll(valueRegex)) {
      const block = match[0]
      const sex = block.includes('>GESM<') ? 'Male' : block.includes('>GESW<') ? 'Female' : null
      const ageMatch = block.match(/>ALTVOLL\d{3}</)
      const valueMatch = block.match(/<pd:value>([^<]+)<\/pd:value>/)

      if (!sex || !ageMatch || !valueMatch) continue

      const age = parseAge(ageMatch[0])
      if (age === null) continue

      values.set(`${sex}:${age}:${valueType}`, Number(valueMatch[1]))
    }
  }

  return values
}

const qx = parseValues(getDistributionsByMeasure(xml, 'Sterbewahrscheinlichkeit [q(x)]'), 'qx')
const lx = parseValues(getDistributionsByMeasure(xml, 'Überlebende [l(x)]'), 'lx')
const rows = []

for (let age = 0; age <= 100; age += 1) {
  const qxMale = qx.get(`Male:${age}:qx`)
  const qxFemale = qx.get(`Female:${age}:qx`)
  const lxMale = lx.get(`Male:${age}:lx`)
  const lxFemale = lx.get(`Female:${age}:lx`)

  if ([qxMale, qxFemale, lxMale, lxFemale].some((value) => typeof value !== 'number' || Number.isNaN(value))) {
    throw new Error(`Missing Destatis values for age ${age}`)
  }

  rows.push({ age, qxMale, qxFemale, lxMale, lxFemale })
}

const output = `import type { MortalityAgeRow } from './mortality'\n\nexport const DESTATIS_GERMANY_PERIOD_LIFE_TABLE_2023_2025_SOURCE = {\n  dataset: 'Destatis/GENESIS 12621-0001',\n  statistic: 'Sterbetafel (Periodensterbetafel): Deutschland, Jahre, Geschlecht, Vollendetes Alter',\n  period: '2023/2025',\n  sourceUrl: '${SOURCE_URL}',\n  license: 'Datenlizenz Deutschland – Namensnennung – Version 2.0',\n  note: 'Destatis provides male and female period life table data with exact ages 0 through 100.',\n} as const\n\nexport const DESTATIS_GERMANY_PERIOD_LIFE_TABLE_2023_2025: MortalityAgeRow[] = ${JSON.stringify(rows, null, 2)}\n`

await writeFile(OUTPUT_PATH, output)
process.stdout.write(`Wrote ${rows.length} Destatis rows to ${OUTPUT_PATH}\n`)

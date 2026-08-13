import type { MortalityAgeRow } from './mortality'

export const EUROSTAT_GERMANY_LIFE_TABLE_2024_SOURCE = {
  dataset: 'Eurostat demo_mlifetable',
  indicator: 'PROBDEATH',
  geo: 'DE',
  time: '2024',
  sourceUrls: [
  "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/demo_mlifetable?geo=DE&time=2024&indic_de=PROBDEATH&lang=en&sex=M",
  "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/demo_mlifetable?geo=DE&time=2024&indic_de=PROBDEATH&lang=en&sex=F",
  "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/demo_mlifetable?geo=DE&time=2024&indic_de=PROBDEATH&lang=en&sex=T"
],
  note: 'Eurostat provides an open terminal age group Y_GE95; survival probabilities above exact age 95 are capped.',
} as const

export const EUROSTAT_GERMANY_LIFE_TABLE_2024: MortalityAgeRow[] = [
  {
    "age": 0,
    "qxMale": 0.00349,
    "qxFemale": 0.00307,
    "qxTotal": 0.00329
  },
  {
    "age": 1,
    "qxMale": 0.00023,
    "qxFemale": 0.00023,
    "qxTotal": 0.00023
  },
  {
    "age": 2,
    "qxMale": 0.00015,
    "qxFemale": 0.00013,
    "qxTotal": 0.00014
  },
  {
    "age": 3,
    "qxMale": 0.00014,
    "qxFemale": 0.00009,
    "qxTotal": 0.00012
  },
  {
    "age": 4,
    "qxMale": 0.00011,
    "qxFemale": 0.00007,
    "qxTotal": 0.00009
  },
  {
    "age": 5,
    "qxMale": 0.00009,
    "qxFemale": 0.0001,
    "qxTotal": 0.0001
  },
  {
    "age": 6,
    "qxMale": 0.00012,
    "qxFemale": 0.00008,
    "qxTotal": 0.0001
  },
  {
    "age": 7,
    "qxMale": 0.00008,
    "qxFemale": 0.0001,
    "qxTotal": 0.00009
  },
  {
    "age": 8,
    "qxMale": 0.0001,
    "qxFemale": 0.00007,
    "qxTotal": 0.00009
  },
  {
    "age": 9,
    "qxMale": 0.00008,
    "qxFemale": 0.00007,
    "qxTotal": 0.00008
  },
  {
    "age": 10,
    "qxMale": 0.00009,
    "qxFemale": 0.00007,
    "qxTotal": 0.00008
  },
  {
    "age": 11,
    "qxMale": 0.00007,
    "qxFemale": 0.00008,
    "qxTotal": 0.00008
  },
  {
    "age": 12,
    "qxMale": 0.00006,
    "qxFemale": 0.00007,
    "qxTotal": 0.00007
  },
  {
    "age": 13,
    "qxMale": 0.00011,
    "qxFemale": 0.00012,
    "qxTotal": 0.00012
  },
  {
    "age": 14,
    "qxMale": 0.00011,
    "qxFemale": 0.00011,
    "qxTotal": 0.00011
  },
  {
    "age": 15,
    "qxMale": 0.00018,
    "qxFemale": 0.00011,
    "qxTotal": 0.00015
  },
  {
    "age": 16,
    "qxMale": 0.00023,
    "qxFemale": 0.00012,
    "qxTotal": 0.00018
  },
  {
    "age": 17,
    "qxMale": 0.00028,
    "qxFemale": 0.00018,
    "qxTotal": 0.00023
  },
  {
    "age": 18,
    "qxMale": 0.00037,
    "qxFemale": 0.00015,
    "qxTotal": 0.00027
  },
  {
    "age": 19,
    "qxMale": 0.00044,
    "qxFemale": 0.00018,
    "qxTotal": 0.00032
  },
  {
    "age": 20,
    "qxMale": 0.00049,
    "qxFemale": 0.00019,
    "qxTotal": 0.00035
  },
  {
    "age": 21,
    "qxMale": 0.0005,
    "qxFemale": 0.00022,
    "qxTotal": 0.00037
  },
  {
    "age": 22,
    "qxMale": 0.00044,
    "qxFemale": 0.0002,
    "qxTotal": 0.00032
  },
  {
    "age": 23,
    "qxMale": 0.00042,
    "qxFemale": 0.00017,
    "qxTotal": 0.0003
  },
  {
    "age": 24,
    "qxMale": 0.00043,
    "qxFemale": 0.0002,
    "qxTotal": 0.00032
  },
  {
    "age": 25,
    "qxMale": 0.00045,
    "qxFemale": 0.00017,
    "qxTotal": 0.00032
  },
  {
    "age": 26,
    "qxMale": 0.00047,
    "qxFemale": 0.00019,
    "qxTotal": 0.00034
  },
  {
    "age": 27,
    "qxMale": 0.00051,
    "qxFemale": 0.00021,
    "qxTotal": 0.00036
  },
  {
    "age": 28,
    "qxMale": 0.00046,
    "qxFemale": 0.00024,
    "qxTotal": 0.00036
  },
  {
    "age": 29,
    "qxMale": 0.00049,
    "qxFemale": 0.00026,
    "qxTotal": 0.00038
  },
  {
    "age": 30,
    "qxMale": 0.00053,
    "qxFemale": 0.00023,
    "qxTotal": 0.00039
  },
  {
    "age": 31,
    "qxMale": 0.00051,
    "qxFemale": 0.00027,
    "qxTotal": 0.00039
  },
  {
    "age": 32,
    "qxMale": 0.00059,
    "qxFemale": 0.00031,
    "qxTotal": 0.00046
  },
  {
    "age": 33,
    "qxMale": 0.00063,
    "qxFemale": 0.00031,
    "qxTotal": 0.00048
  },
  {
    "age": 34,
    "qxMale": 0.00075,
    "qxFemale": 0.00038,
    "qxTotal": 0.00057
  },
  {
    "age": 35,
    "qxMale": 0.00083,
    "qxFemale": 0.00045,
    "qxTotal": 0.00065
  },
  {
    "age": 36,
    "qxMale": 0.00088,
    "qxFemale": 0.00051,
    "qxTotal": 0.0007
  },
  {
    "age": 37,
    "qxMale": 0.00092,
    "qxFemale": 0.00054,
    "qxTotal": 0.00074
  },
  {
    "age": 38,
    "qxMale": 0.00099,
    "qxFemale": 0.00059,
    "qxTotal": 0.00079
  },
  {
    "age": 39,
    "qxMale": 0.00125,
    "qxFemale": 0.00064,
    "qxTotal": 0.00095
  },
  {
    "age": 40,
    "qxMale": 0.00129,
    "qxFemale": 0.00067,
    "qxTotal": 0.00098
  },
  {
    "age": 41,
    "qxMale": 0.00128,
    "qxFemale": 0.00078,
    "qxTotal": 0.00103
  },
  {
    "age": 42,
    "qxMale": 0.00154,
    "qxFemale": 0.00084,
    "qxTotal": 0.00119
  },
  {
    "age": 43,
    "qxMale": 0.0016,
    "qxFemale": 0.0009,
    "qxTotal": 0.00125
  },
  {
    "age": 44,
    "qxMale": 0.00174,
    "qxFemale": 0.00101,
    "qxTotal": 0.00137
  },
  {
    "age": 45,
    "qxMale": 0.00195,
    "qxFemale": 0.00104,
    "qxTotal": 0.00149
  },
  {
    "age": 46,
    "qxMale": 0.00222,
    "qxFemale": 0.00121,
    "qxTotal": 0.00172
  },
  {
    "age": 47,
    "qxMale": 0.00234,
    "qxFemale": 0.00137,
    "qxTotal": 0.00186
  },
  {
    "age": 48,
    "qxMale": 0.00252,
    "qxFemale": 0.0014,
    "qxTotal": 0.00196
  },
  {
    "age": 49,
    "qxMale": 0.00269,
    "qxFemale": 0.00158,
    "qxTotal": 0.00213
  },
  {
    "age": 50,
    "qxMale": 0.00325,
    "qxFemale": 0.00178,
    "qxTotal": 0.00252
  },
  {
    "age": 51,
    "qxMale": 0.00338,
    "qxFemale": 0.00205,
    "qxTotal": 0.00272
  },
  {
    "age": 52,
    "qxMale": 0.00405,
    "qxFemale": 0.00216,
    "qxTotal": 0.0031
  },
  {
    "age": 53,
    "qxMale": 0.00421,
    "qxFemale": 0.00237,
    "qxTotal": 0.00329
  },
  {
    "age": 54,
    "qxMale": 0.00442,
    "qxFemale": 0.00254,
    "qxTotal": 0.00348
  },
  {
    "age": 55,
    "qxMale": 0.00508,
    "qxFemale": 0.00292,
    "qxTotal": 0.004
  },
  {
    "age": 56,
    "qxMale": 0.00573,
    "qxFemale": 0.0032,
    "qxTotal": 0.00447
  },
  {
    "age": 57,
    "qxMale": 0.0063,
    "qxFemale": 0.00348,
    "qxTotal": 0.00489
  },
  {
    "age": 58,
    "qxMale": 0.00695,
    "qxFemale": 0.00385,
    "qxTotal": 0.0054
  },
  {
    "age": 59,
    "qxMale": 0.00791,
    "qxFemale": 0.00433,
    "qxTotal": 0.00612
  },
  {
    "age": 60,
    "qxMale": 0.00877,
    "qxFemale": 0.00481,
    "qxTotal": 0.00678
  },
  {
    "age": 61,
    "qxMale": 0.00973,
    "qxFemale": 0.00534,
    "qxTotal": 0.00752
  },
  {
    "age": 62,
    "qxMale": 0.01103,
    "qxFemale": 0.00585,
    "qxTotal": 0.0084
  },
  {
    "age": 63,
    "qxMale": 0.0121,
    "qxFemale": 0.00659,
    "qxTotal": 0.00929
  },
  {
    "age": 64,
    "qxMale": 0.01373,
    "qxFemale": 0.00738,
    "qxTotal": 0.01048
  },
  {
    "age": 65,
    "qxMale": 0.01507,
    "qxFemale": 0.00793,
    "qxTotal": 0.0114
  },
  {
    "age": 66,
    "qxMale": 0.01633,
    "qxFemale": 0.00904,
    "qxTotal": 0.01257
  },
  {
    "age": 67,
    "qxMale": 0.0177,
    "qxFemale": 0.00986,
    "qxTotal": 0.01365
  },
  {
    "age": 68,
    "qxMale": 0.01933,
    "qxFemale": 0.01065,
    "qxTotal": 0.01482
  },
  {
    "age": 69,
    "qxMale": 0.02147,
    "qxFemale": 0.01142,
    "qxTotal": 0.0162
  },
  {
    "age": 70,
    "qxMale": 0.02269,
    "qxFemale": 0.01271,
    "qxTotal": 0.0174
  },
  {
    "age": 71,
    "qxMale": 0.02476,
    "qxFemale": 0.01407,
    "qxTotal": 0.01906
  },
  {
    "age": 72,
    "qxMale": 0.02667,
    "qxFemale": 0.01564,
    "qxTotal": 0.02076
  },
  {
    "age": 73,
    "qxMale": 0.02863,
    "qxFemale": 0.01683,
    "qxTotal": 0.02228
  },
  {
    "age": 74,
    "qxMale": 0.03133,
    "qxFemale": 0.01867,
    "qxTotal": 0.02449
  },
  {
    "age": 75,
    "qxMale": 0.03455,
    "qxFemale": 0.02096,
    "qxTotal": 0.0272
  },
  {
    "age": 76,
    "qxMale": 0.03733,
    "qxFemale": 0.02304,
    "qxTotal": 0.02956
  },
  {
    "age": 77,
    "qxMale": 0.04297,
    "qxFemale": 0.0273,
    "qxTotal": 0.03437
  },
  {
    "age": 78,
    "qxMale": 0.04185,
    "qxFemale": 0.02737,
    "qxTotal": 0.0338
  },
  {
    "age": 79,
    "qxMale": 0.05061,
    "qxFemale": 0.03328,
    "qxTotal": 0.0409
  },
  {
    "age": 80,
    "qxMale": 0.05663,
    "qxFemale": 0.03721,
    "qxTotal": 0.04569
  },
  {
    "age": 81,
    "qxMale": 0.06034,
    "qxFemale": 0.04035,
    "qxTotal": 0.04897
  },
  {
    "age": 82,
    "qxMale": 0.06847,
    "qxFemale": 0.04729,
    "qxTotal": 0.05625
  },
  {
    "age": 83,
    "qxMale": 0.07368,
    "qxFemale": 0.05027,
    "qxTotal": 0.05994
  },
  {
    "age": 84,
    "qxMale": 0.08611,
    "qxFemale": 0.06069,
    "qxTotal": 0.07095
  },
  {
    "age": 85,
    "qxMale": 0.09546,
    "qxFemale": 0.06921,
    "qxTotal": 0.07959
  },
  {
    "age": 86,
    "qxMale": 0.10685,
    "qxFemale": 0.07918,
    "qxTotal": 0.08988
  },
  {
    "age": 87,
    "qxMale": 0.12245,
    "qxFemale": 0.09231,
    "qxTotal": 0.10365
  },
  {
    "age": 88,
    "qxMale": 0.13929,
    "qxFemale": 0.10671,
    "qxTotal": 0.11856
  },
  {
    "age": 89,
    "qxMale": 0.16483,
    "qxFemale": 0.12436,
    "qxTotal": 0.13857
  },
  {
    "age": 90,
    "qxMale": 0.17872,
    "qxFemale": 0.13898,
    "qxTotal": 0.15236
  },
  {
    "age": 91,
    "qxMale": 0.2018,
    "qxFemale": 0.16103,
    "qxTotal": 0.17415
  },
  {
    "age": 92,
    "qxMale": 0.22632,
    "qxFemale": 0.18064,
    "qxTotal": 0.19461
  },
  {
    "age": 93,
    "qxMale": 0.24896,
    "qxFemale": 0.20335,
    "qxTotal": 0.21652
  },
  {
    "age": 94,
    "qxMale": 0.27064,
    "qxFemale": 0.22633,
    "qxTotal": 0.23848
  },
  {
    "age": 95,
    "qxMale": 1,
    "qxFemale": 1,
    "qxTotal": 1
  }
]

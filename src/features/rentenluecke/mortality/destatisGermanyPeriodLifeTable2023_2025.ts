import type { MortalityAgeRow } from './mortality'

export const DESTATIS_GERMANY_PERIOD_LIFE_TABLE_2023_2025_SOURCE = {
  dataset: 'Destatis/GENESIS 12621-0001',
  statistic: 'Sterbetafel (Periodensterbetafel): Deutschland, Jahre, Geschlecht, Vollendetes Alter',
  period: '2023/2025',
  sourceUrl: 'https://genesis.destatis.de/genesisWS/inspire/pd/00/features/12621-0001.xml',
  license: 'Datenlizenz Deutschland – Namensnennung – Version 2.0',
  note: 'Destatis provides male and female period life table data with exact ages 0 through 100.',
} as const

export const DESTATIS_GERMANY_PERIOD_LIFE_TABLE_2023_2025: MortalityAgeRow[] = [
  {
    "age": 0,
    "qxMale": 0.00337973,
    "qxFemale": 0.00297186,
    "lxMale": 100000,
    "lxFemale": 100000
  },
  {
    "age": 1,
    "qxMale": 0.00023848,
    "qxFemale": 0.00023409,
    "lxMale": 99662,
    "lxFemale": 99703
  },
  {
    "age": 2,
    "qxMale": 0.00017394,
    "qxFemale": 0.00012809,
    "lxMale": 99638,
    "lxFemale": 99679
  },
  {
    "age": 3,
    "qxMale": 0.00012994,
    "qxFemale": 0.00011488,
    "lxMale": 99621,
    "lxFemale": 99667
  },
  {
    "age": 4,
    "qxMale": 0.00012837,
    "qxFemale": 0.00006838,
    "lxMale": 99608,
    "lxFemale": 99655
  },
  {
    "age": 5,
    "qxMale": 0.0000979,
    "qxFemale": 0.00009089,
    "lxMale": 99595,
    "lxFemale": 99648
  },
  {
    "age": 6,
    "qxMale": 0.00011053,
    "qxFemale": 0.0000821,
    "lxMale": 99585,
    "lxFemale": 99639
  },
  {
    "age": 7,
    "qxMale": 0.00009229,
    "qxFemale": 0.00007998,
    "lxMale": 99574,
    "lxFemale": 99631
  },
  {
    "age": 8,
    "qxMale": 0.00009347,
    "qxFemale": 0.00006939,
    "lxMale": 99565,
    "lxFemale": 99623
  },
  {
    "age": 9,
    "qxMale": 0.00008173,
    "qxFemale": 0.00006104,
    "lxMale": 99556,
    "lxFemale": 99616
  },
  {
    "age": 10,
    "qxMale": 0.00007482,
    "qxFemale": 0.0000762,
    "lxMale": 99548,
    "lxFemale": 99610
  },
  {
    "age": 11,
    "qxMale": 0.0000708,
    "qxFemale": 0.00007024,
    "lxMale": 99540,
    "lxFemale": 99603
  },
  {
    "age": 12,
    "qxMale": 0.00007887,
    "qxFemale": 0.00007698,
    "lxMale": 99533,
    "lxFemale": 99596
  },
  {
    "age": 13,
    "qxMale": 0.00011179,
    "qxFemale": 0.00010737,
    "lxMale": 99525,
    "lxFemale": 99588
  },
  {
    "age": 14,
    "qxMale": 0.0001423,
    "qxFemale": 0.00010782,
    "lxMale": 99514,
    "lxFemale": 99577
  },
  {
    "age": 15,
    "qxMale": 0.00017258,
    "qxFemale": 0.00012052,
    "lxMale": 99500,
    "lxFemale": 99567
  },
  {
    "age": 16,
    "qxMale": 0.00023277,
    "qxFemale": 0.00015504,
    "lxMale": 99483,
    "lxFemale": 99555
  },
  {
    "age": 17,
    "qxMale": 0.00029968,
    "qxFemale": 0.00016784,
    "lxMale": 99460,
    "lxFemale": 99539
  },
  {
    "age": 18,
    "qxMale": 0.00036142,
    "qxFemale": 0.00017171,
    "lxMale": 99430,
    "lxFemale": 99522
  },
  {
    "age": 19,
    "qxMale": 0.00044782,
    "qxFemale": 0.00019847,
    "lxMale": 99394,
    "lxFemale": 99505
  },
  {
    "age": 20,
    "qxMale": 0.00047211,
    "qxFemale": 0.00019487,
    "lxMale": 99350,
    "lxFemale": 99486
  },
  {
    "age": 21,
    "qxMale": 0.00043939,
    "qxFemale": 0.00019559,
    "lxMale": 99303,
    "lxFemale": 99466
  },
  {
    "age": 22,
    "qxMale": 0.00045814,
    "qxFemale": 0.00018474,
    "lxMale": 99259,
    "lxFemale": 99447
  },
  {
    "age": 23,
    "qxMale": 0.00042747,
    "qxFemale": 0.00017023,
    "lxMale": 99214,
    "lxFemale": 99428
  },
  {
    "age": 24,
    "qxMale": 0.00041442,
    "qxFemale": 0.00019728,
    "lxMale": 99171,
    "lxFemale": 99411
  },
  {
    "age": 25,
    "qxMale": 0.00044904,
    "qxFemale": 0.0001679,
    "lxMale": 99130,
    "lxFemale": 99392
  },
  {
    "age": 26,
    "qxMale": 0.00047171,
    "qxFemale": 0.00021335,
    "lxMale": 99086,
    "lxFemale": 99375
  },
  {
    "age": 27,
    "qxMale": 0.00049493,
    "qxFemale": 0.00021169,
    "lxMale": 99039,
    "lxFemale": 99354
  },
  {
    "age": 28,
    "qxMale": 0.00047103,
    "qxFemale": 0.00021886,
    "lxMale": 98990,
    "lxFemale": 99333
  },
  {
    "age": 29,
    "qxMale": 0.00048891,
    "qxFemale": 0.0002496,
    "lxMale": 98943,
    "lxFemale": 99311
  },
  {
    "age": 30,
    "qxMale": 0.0005311,
    "qxFemale": 0.00025126,
    "lxMale": 98895,
    "lxFemale": 99286
  },
  {
    "age": 31,
    "qxMale": 0.00054641,
    "qxFemale": 0.00027481,
    "lxMale": 98842,
    "lxFemale": 99261
  },
  {
    "age": 32,
    "qxMale": 0.00059019,
    "qxFemale": 0.00032685,
    "lxMale": 98788,
    "lxFemale": 99234
  },
  {
    "age": 33,
    "qxMale": 0.00063461,
    "qxFemale": 0.00033153,
    "lxMale": 98730,
    "lxFemale": 99202
  },
  {
    "age": 34,
    "qxMale": 0.00073586,
    "qxFemale": 0.00036954,
    "lxMale": 98667,
    "lxFemale": 99169
  },
  {
    "age": 35,
    "qxMale": 0.00076559,
    "qxFemale": 0.00042635,
    "lxMale": 98595,
    "lxFemale": 99132
  },
  {
    "age": 36,
    "qxMale": 0.00087725,
    "qxFemale": 0.00047326,
    "lxMale": 98519,
    "lxFemale": 99090
  },
  {
    "age": 37,
    "qxMale": 0.00095712,
    "qxFemale": 0.00052014,
    "lxMale": 98433,
    "lxFemale": 99043
  },
  {
    "age": 38,
    "qxMale": 0.00099013,
    "qxFemale": 0.00056724,
    "lxMale": 98339,
    "lxFemale": 98992
  },
  {
    "age": 39,
    "qxMale": 0.00118971,
    "qxFemale": 0.00066577,
    "lxMale": 98241,
    "lxFemale": 98935
  },
  {
    "age": 40,
    "qxMale": 0.00124893,
    "qxFemale": 0.00069123,
    "lxMale": 98124,
    "lxFemale": 98869
  },
  {
    "age": 41,
    "qxMale": 0.00134855,
    "qxFemale": 0.00076512,
    "lxMale": 98002,
    "lxFemale": 98801
  },
  {
    "age": 42,
    "qxMale": 0.00149366,
    "qxFemale": 0.00081756,
    "lxMale": 97870,
    "lxFemale": 98726
  },
  {
    "age": 43,
    "qxMale": 0.00163003,
    "qxFemale": 0.00089618,
    "lxMale": 97723,
    "lxFemale": 98645
  },
  {
    "age": 44,
    "qxMale": 0.00177277,
    "qxFemale": 0.00097553,
    "lxMale": 97564,
    "lxFemale": 98556
  },
  {
    "age": 45,
    "qxMale": 0.00189971,
    "qxFemale": 0.00104017,
    "lxMale": 97391,
    "lxFemale": 98460
  },
  {
    "age": 46,
    "qxMale": 0.00218745,
    "qxFemale": 0.00115532,
    "lxMale": 97206,
    "lxFemale": 98358
  },
  {
    "age": 47,
    "qxMale": 0.00236145,
    "qxFemale": 0.00132971,
    "lxMale": 96994,
    "lxFemale": 98244
  },
  {
    "age": 48,
    "qxMale": 0.00257199,
    "qxFemale": 0.00144925,
    "lxMale": 96764,
    "lxFemale": 98114
  },
  {
    "age": 49,
    "qxMale": 0.00284628,
    "qxFemale": 0.00160442,
    "lxMale": 96516,
    "lxFemale": 97971
  },
  {
    "age": 50,
    "qxMale": 0.0031862,
    "qxFemale": 0.00176097,
    "lxMale": 96241,
    "lxFemale": 97814
  },
  {
    "age": 51,
    "qxMale": 0.00340912,
    "qxFemale": 0.00194221,
    "lxMale": 95934,
    "lxFemale": 97642
  },
  {
    "age": 52,
    "qxMale": 0.00391463,
    "qxFemale": 0.00210465,
    "lxMale": 95607,
    "lxFemale": 97452
  },
  {
    "age": 53,
    "qxMale": 0.00428508,
    "qxFemale": 0.00234276,
    "lxMale": 95233,
    "lxFemale": 97247
  },
  {
    "age": 54,
    "qxMale": 0.00462197,
    "qxFemale": 0.00257937,
    "lxMale": 94825,
    "lxFemale": 97019
  },
  {
    "age": 55,
    "qxMale": 0.00515809,
    "qxFemale": 0.00282649,
    "lxMale": 94387,
    "lxFemale": 96769
  },
  {
    "age": 56,
    "qxMale": 0.00568044,
    "qxFemale": 0.00315469,
    "lxMale": 93900,
    "lxFemale": 96496
  },
  {
    "age": 57,
    "qxMale": 0.00630946,
    "qxFemale": 0.00348788,
    "lxMale": 93366,
    "lxFemale": 96191
  },
  {
    "age": 58,
    "qxMale": 0.00709894,
    "qxFemale": 0.00389027,
    "lxMale": 92777,
    "lxFemale": 95856
  },
  {
    "age": 59,
    "qxMale": 0.00789155,
    "qxFemale": 0.00425263,
    "lxMale": 92119,
    "lxFemale": 95483
  },
  {
    "age": 60,
    "qxMale": 0.00885321,
    "qxFemale": 0.0047979,
    "lxMale": 91392,
    "lxFemale": 95077
  },
  {
    "age": 61,
    "qxMale": 0.0098336,
    "qxFemale": 0.0053514,
    "lxMale": 90583,
    "lxFemale": 94621
  },
  {
    "age": 62,
    "qxMale": 0.01100999,
    "qxFemale": 0.0059251,
    "lxMale": 89692,
    "lxFemale": 94114
  },
  {
    "age": 63,
    "qxMale": 0.01221235,
    "qxFemale": 0.00660057,
    "lxMale": 88704,
    "lxFemale": 93557
  },
  {
    "age": 64,
    "qxMale": 0.01362106,
    "qxFemale": 0.0074496,
    "lxMale": 87621,
    "lxFemale": 92939
  },
  {
    "age": 65,
    "qxMale": 0.01495119,
    "qxFemale": 0.00807691,
    "lxMale": 86428,
    "lxFemale": 92247
  },
  {
    "age": 66,
    "qxMale": 0.01629018,
    "qxFemale": 0.00903732,
    "lxMale": 85135,
    "lxFemale": 91502
  },
  {
    "age": 67,
    "qxMale": 0.01787807,
    "qxFemale": 0.00978852,
    "lxMale": 83748,
    "lxFemale": 90675
  },
  {
    "age": 68,
    "qxMale": 0.01937408,
    "qxFemale": 0.01070909,
    "lxMale": 82251,
    "lxFemale": 89787
  },
  {
    "age": 69,
    "qxMale": 0.02123238,
    "qxFemale": 0.01172668,
    "lxMale": 80658,
    "lxFemale": 88826
  },
  {
    "age": 70,
    "qxMale": 0.02276645,
    "qxFemale": 0.01285867,
    "lxMale": 78945,
    "lxFemale": 87784
  },
  {
    "age": 71,
    "qxMale": 0.02496727,
    "qxFemale": 0.01411575,
    "lxMale": 77148,
    "lxFemale": 86655
  },
  {
    "age": 72,
    "qxMale": 0.02665779,
    "qxFemale": 0.01566286,
    "lxMale": 75222,
    "lxFemale": 85432
  },
  {
    "age": 73,
    "qxMale": 0.02908224,
    "qxFemale": 0.01703484,
    "lxMale": 73216,
    "lxFemale": 84094
  },
  {
    "age": 74,
    "qxMale": 0.03167023,
    "qxFemale": 0.01866776,
    "lxMale": 71087,
    "lxFemale": 82661
  },
  {
    "age": 75,
    "qxMale": 0.03432546,
    "qxFemale": 0.02078034,
    "lxMale": 68836,
    "lxFemale": 81118
  },
  {
    "age": 76,
    "qxMale": 0.03826994,
    "qxFemale": 0.02362201,
    "lxMale": 66473,
    "lxFemale": 79433
  },
  {
    "age": 77,
    "qxMale": 0.04087129,
    "qxFemale": 0.0260665,
    "lxMale": 63929,
    "lxFemale": 77556
  },
  {
    "age": 78,
    "qxMale": 0.0451161,
    "qxFemale": 0.0293188,
    "lxMale": 61316,
    "lxFemale": 75535
  },
  {
    "age": 79,
    "qxMale": 0.04999682,
    "qxFemale": 0.03261117,
    "lxMale": 58550,
    "lxFemale": 73320
  },
  {
    "age": 80,
    "qxMale": 0.05628556,
    "qxFemale": 0.03721584,
    "lxMale": 55623,
    "lxFemale": 70929
  },
  {
    "age": 81,
    "qxMale": 0.0622324,
    "qxFemale": 0.04174881,
    "lxMale": 52492,
    "lxFemale": 68289
  },
  {
    "age": 82,
    "qxMale": 0.06780268,
    "qxFemale": 0.04638967,
    "lxMale": 49225,
    "lxFemale": 65438
  },
  {
    "age": 83,
    "qxMale": 0.07629517,
    "qxFemale": 0.05241448,
    "lxMale": 45887,
    "lxFemale": 62403
  },
  {
    "age": 84,
    "qxMale": 0.08485612,
    "qxFemale": 0.05978489,
    "lxMale": 42386,
    "lxFemale": 59132
  },
  {
    "age": 85,
    "qxMale": 0.0965306,
    "qxFemale": 0.06930192,
    "lxMale": 38790,
    "lxFemale": 55597
  },
  {
    "age": 86,
    "qxMale": 0.10862558,
    "qxFemale": 0.07990936,
    "lxMale": 35045,
    "lxFemale": 51744
  },
  {
    "age": 87,
    "qxMale": 0.12271374,
    "qxFemale": 0.09272942,
    "lxMale": 31239,
    "lxFemale": 47609
  },
  {
    "age": 88,
    "qxMale": 0.14125873,
    "qxFemale": 0.10818722,
    "lxMale": 27405,
    "lxFemale": 43194
  },
  {
    "age": 89,
    "qxMale": 0.16113923,
    "qxFemale": 0.12325612,
    "lxMale": 23534,
    "lxFemale": 38521
  },
  {
    "age": 90,
    "qxMale": 0.18176939,
    "qxFemale": 0.14218675,
    "lxMale": 19742,
    "lxFemale": 33773
  },
  {
    "age": 91,
    "qxMale": 0.20175957,
    "qxFemale": 0.16105283,
    "lxMale": 16153,
    "lxFemale": 28971
  },
  {
    "age": 92,
    "qxMale": 0.22695222,
    "qxFemale": 0.18339439,
    "lxMale": 12894,
    "lxFemale": 24305
  },
  {
    "age": 93,
    "qxMale": 0.25156527,
    "qxFemale": 0.2052944,
    "lxMale": 9968,
    "lxFemale": 19848
  },
  {
    "age": 94,
    "qxMale": 0.27415755,
    "qxFemale": 0.22960622,
    "lxMale": 7460,
    "lxFemale": 15773
  },
  {
    "age": 95,
    "qxMale": 0.300763,
    "qxFemale": 0.25448253,
    "lxMale": 5415,
    "lxFemale": 12152
  },
  {
    "age": 96,
    "qxMale": 0.32307453,
    "qxFemale": 0.27611974,
    "lxMale": 3786,
    "lxFemale": 9059
  },
  {
    "age": 97,
    "qxMale": 0.34506218,
    "qxFemale": 0.30376007,
    "lxMale": 2563,
    "lxFemale": 6558
  },
  {
    "age": 98,
    "qxMale": 0.37364562,
    "qxFemale": 0.32942217,
    "lxMale": 1679,
    "lxFemale": 4566
  },
  {
    "age": 99,
    "qxMale": 0.39574925,
    "qxFemale": 0.34911202,
    "lxMale": 1051,
    "lxFemale": 3062
  },
  {
    "age": 100,
    "qxMale": 0.41832841,
    "qxFemale": 0.36883051,
    "lxMale": 635,
    "lxFemale": 1993
  }
]

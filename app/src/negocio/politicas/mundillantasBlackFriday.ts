/**
 * BLACK FRIDAY DE COMPETIMOTOR — GENERADO, no se edita a mano.
 *
 * Sale de `app/scripts/competimotor/black-friday.ts` (20-nov-2026), que cruza
 * «LLANTAS BLACK FRIDAY.xlsx» de Carlos Romero con el inventario de Fénix del
 * mismo día. Solo las filas que cruzaron con UN artículo, cuyo precio es menor
 * que el P2 (con tarjeta) y no parece un tipeo (más de 40 % de descuento). Las
 * demás están en
 * `docs/clientes/competimotor-black-friday-2026.md`.
 *
 * `precioConIva`: el de la lista tal cual (el precio final por llanta, con
 * IVA y con servicios). Ver el informe para el porqué.
 */
export const LLANTAS_BLACK_FRIDAY: ReadonlyArray<{ codigo: string; medida: string; lista: string; fila: number; precioConIva: number }> = [
  {
    "codigo": "R13/185/60 MAXXIS MP1",
    "medida": "185/60R13",
    "lista": "MAXXIS MP10",
    "fila": 7,
    "precioConIva": 53
  },
  {
    "codigo": "A0006",
    "medida": "185/70R13",
    "lista": "CONTINENTAL",
    "fila": 8,
    "precioConIva": 80
  },
  {
    "codigo": "A0099",
    "medida": "165/60R14",
    "lista": "GENERAL",
    "fila": 10,
    "precioConIva": 66
  },
  {
    "codigo": "A0206",
    "medida": "165/60R14",
    "lista": "KENDA",
    "fila": 11,
    "precioConIva": 59
  },
  {
    "codigo": "TOW-030",
    "medida": "175/70R14",
    "lista": "TOWNHALL",
    "fila": 12,
    "precioConIva": 39
  },
  {
    "codigo": "A0210",
    "medida": "175/70R14",
    "lista": "KENDA",
    "fila": 13,
    "precioConIva": 55
  },
  {
    "codigo": "1485",
    "medida": "185/60R14",
    "lista": "KENDA KR20",
    "fila": 14,
    "precioConIva": 68
  },
  {
    "codigo": "A0477",
    "medida": "185/65R14",
    "lista": "TOWNHALL TH161",
    "fila": 15,
    "precioConIva": 42
  },
  {
    "codigo": "R14/195/70 OPALS",
    "medida": "195/70R14",
    "lista": "OPALS",
    "fila": 16,
    "precioConIva": 55
  },
  {
    "codigo": "A0200",
    "medida": "195/70R14",
    "lista": "KAPSEN",
    "fila": 17,
    "precioConIva": 51
  },
  {
    "codigo": "R14/205/60 NEREUS NS6",
    "medida": "205/60R14",
    "lista": "NEREUS",
    "fila": 18,
    "precioConIva": 55
  },
  {
    "codigo": "A0505",
    "medida": "195R14",
    "lista": "TRAZANO",
    "fila": 19,
    "precioConIva": 75
  },
  {
    "codigo": "A0542",
    "medida": "215/75R14",
    "lista": "WINRUN",
    "fila": 21,
    "precioConIva": 99
  },
  {
    "codigo": "1857",
    "medida": "215/75R14",
    "lista": "LINLONG",
    "fila": 22,
    "precioConIva": 82
  },
  {
    "codigo": "A0241",
    "medida": "215/75R14",
    "lista": "KENDA",
    "fila": 23,
    "precioConIva": 100
  },
  {
    "codigo": "A0112",
    "medida": "185/55R15",
    "lista": "HAIDA HD921",
    "fila": 25,
    "precioConIva": 59
  },
  {
    "codigo": "A0116",
    "medida": "185/65R15",
    "lista": "HAIDA RUNSPIRIT",
    "fila": 26,
    "precioConIva": 52
  },
  {
    "codigo": "A0478",
    "medida": "195/50R15",
    "lista": "TOWNHALL",
    "fila": 27,
    "precioConIva": 48
  },
  {
    "codigo": "A0700",
    "medida": "195/60R15",
    "lista": "CONTINENTAL",
    "fila": 28,
    "precioConIva": 90
  },
  {
    "codigo": "A0226",
    "medida": "195R15",
    "lista": "KENDA",
    "fila": 29,
    "precioConIva": 100
  },
  {
    "codigo": "356518",
    "medida": "215/75R15",
    "lista": "FALKEN AT4W",
    "fila": 31,
    "precioConIva": 198
  },
  {
    "codigo": "A0253",
    "medida": "225/70R15",
    "lista": "KENDA KR33",
    "fila": 32,
    "precioConIva": 109
  },
  {
    "codigo": "A0142",
    "medida": "225/70R15",
    "lista": "HAIDA HD737",
    "fila": 33,
    "precioConIva": 85
  },
  {
    "codigo": "A0068",
    "medida": "235/75R15",
    "lista": "FALKEN AT4W",
    "fila": 34,
    "precioConIva": 200
  },
  {
    "codigo": "A0010",
    "medida": "245/60R15",
    "lista": "COOPER",
    "fila": 35,
    "precioConIva": 125
  },
  {
    "codigo": "A0092",
    "medida": "30X9.5R15",
    "lista": "FALKEN MT",
    "fila": 36,
    "precioConIva": 220
  },
  {
    "codigo": "A0318",
    "medida": "30X9.5R15",
    "lista": "KENDA KR628",
    "fila": 37,
    "precioConIva": 165
  },
  {
    "codigo": "A0321",
    "medida": "31X10.5R15",
    "lista": "KENDA KR628",
    "fila": 38,
    "precioConIva": 179
  },
  {
    "codigo": "A0320",
    "medida": "31X10.5R15",
    "lista": "KENDA KR29",
    "fila": 39,
    "precioConIva": 183
  },
  {
    "codigo": "A0324",
    "medida": "7.00R15",
    "lista": "KENDA KR12",
    "fila": 40,
    "precioConIva": 138
  },
  {
    "codigo": "A0119",
    "medida": "195/45R16",
    "lista": "HAIDA HD921",
    "fila": 42,
    "precioConIva": 49
  },
  {
    "codigo": "A0218",
    "medida": "195/45R16",
    "lista": "KENDA KR20",
    "fila": 43,
    "precioConIva": 89
  },
  {
    "codigo": "A0129",
    "medida": "205/55R16",
    "lista": "HAIDA RUNSPIRIT",
    "fila": 45,
    "precioConIva": 50
  },
  {
    "codigo": "A0481",
    "medida": "205/55R16",
    "lista": "TOWNHALL",
    "fila": 46,
    "precioConIva": 49
  },
  {
    "codigo": "A0572",
    "medida": "205/55R16",
    "lista": "XBRI ECOLOGY",
    "fila": 47,
    "precioConIva": 48
  },
  {
    "codigo": "A0575",
    "medida": "215/70R16",
    "lista": "XBRI HT2",
    "fila": 48,
    "precioConIva": 100
  },
  {
    "codigo": "A0240",
    "medida": "215/70R16",
    "lista": "KENDA KR50",
    "fila": 49,
    "precioConIva": 110
  },
  {
    "codigo": "A0025",
    "medida": "235/60R16",
    "lista": "DURUN HG918",
    "fila": 50,
    "precioConIva": 70
  },
  {
    "codigo": "A0067",
    "medida": "235/70R16",
    "lista": "FALKEN AT4W",
    "fila": 51,
    "precioConIva": 182
  },
  {
    "codigo": "A0029",
    "medida": "245/70R16",
    "lista": "DURUN RT02",
    "fila": 52,
    "precioConIva": 129
  },
  {
    "codigo": "A0283",
    "medida": "245/75R16",
    "lista": "KENDA KR28",
    "fila": 54,
    "precioConIva": 130
  },
  {
    "codigo": "A0284",
    "medida": "245/75R16",
    "lista": "KENDA KR29",
    "fila": 55,
    "precioConIva": 190
  },
  {
    "codigo": "A0522",
    "medida": "265/70R16",
    "lista": "WIDEWAY",
    "fila": 56,
    "precioConIva": 95
  },
  {
    "codigo": "A0305",
    "medida": "265/75R16",
    "lista": "KENDA MT",
    "fila": 58,
    "precioConIva": 215
  },
  {
    "codigo": "A0166",
    "medida": "265/75R16",
    "lista": "HAIDA HD868",
    "fila": 59,
    "precioConIva": 159
  },
  {
    "codigo": "A0310",
    "medida": "275/70R16",
    "lista": "KENDA KR28",
    "fila": 60,
    "precioConIva": 180
  },
  {
    "codigo": "A0317",
    "medida": "285/75R16",
    "lista": "KENDA KR29",
    "fila": 61,
    "precioConIva": 273
  },
  {
    "codigo": "K416B739",
    "medida": "205/45R17",
    "lista": "KENDA KR41",
    "fila": 64,
    "precioConIva": 72
  },
  {
    "codigo": "A0058",
    "medida": "225/65R17",
    "lista": "FALKEN ZE310",
    "fila": 66,
    "precioConIva": 145
  },
  {
    "codigo": "A0057",
    "medida": "225/65R17",
    "lista": "FALKEN AT4W",
    "fila": 67,
    "precioConIva": 199
  },
  {
    "codigo": "A0023",
    "medida": "235/45R17",
    "lista": "DURUN",
    "fila": 68,
    "precioConIva": 59
  },
  {
    "codigo": "A0257",
    "medida": "235/55R17",
    "lista": "KENDA KR50",
    "fila": 69,
    "precioConIva": 115
  },
  {
    "codigo": "A0550",
    "medida": "235/60R17",
    "lista": "WINRUN R380",
    "fila": 71,
    "precioConIva": 99
  },
  {
    "codigo": "A0027",
    "medida": "235/65R17",
    "lista": "DURUN RT02",
    "fila": 72,
    "precioConIva": 139
  },
  {
    "codigo": "A0267",
    "medida": "235/65R17",
    "lista": "KENDA KR50",
    "fila": 73,
    "precioConIva": 122
  },
  {
    "codigo": "A0266",
    "medida": "235/65R17",
    "lista": "KENDA KR28",
    "fila": 74,
    "precioConIva": 129
  },
  {
    "codigo": "TOU-047",
    "medida": "235/65R17",
    "lista": "TOURADOR FORCE AT",
    "fila": 75,
    "precioConIva": 109
  },
  {
    "codigo": "TOU-048",
    "medida": "245/75R17",
    "lista": "TOURADOR FORCE AT",
    "fila": 76,
    "precioConIva": 155
  },
  {
    "codigo": "A0032",
    "medida": "265/65R17",
    "lista": "DURUN RT02",
    "fila": 77,
    "precioConIva": 139
  },
  {
    "codigo": "A0561",
    "medida": "265/65R17",
    "lista": "WINRUN RT",
    "fila": 78,
    "precioConIva": 139
  },
  {
    "codigo": "A0560",
    "medida": "265/65R17",
    "lista": "WINRUN MAXCLAW AT",
    "fila": 79,
    "precioConIva": 135
  },
  {
    "codigo": "A0496",
    "medida": "265/65R17",
    "lista": "TOWNHALL",
    "fila": 80,
    "precioConIva": 130
  },
  {
    "codigo": "A0296",
    "medida": "265/65R17",
    "lista": "KENDA KR601",
    "fila": 81,
    "precioConIva": 199
  },
  {
    "codigo": "A0012",
    "medida": "265/70R17",
    "lista": "COOPER MT",
    "fila": 82,
    "precioConIva": 180
  },
  {
    "codigo": "A0084",
    "medida": "265/70R17",
    "lista": "FALKEN MT",
    "fila": 83,
    "precioConIva": 250
  },
  {
    "codigo": "TOW-023",
    "medida": "265/70R17",
    "lista": "TOWNHALL",
    "fila": 84,
    "precioConIva": 119
  },
  {
    "codigo": "A0311",
    "medida": "275/70R17",
    "lista": "KENDA 608",
    "fila": 85,
    "precioConIva": 235
  },
  {
    "codigo": "A0314",
    "medida": "285/65R17",
    "lista": "KENDA KR28",
    "fila": 86,
    "precioConIva": 199
  },
  {
    "codigo": "TOU-037",
    "medida": "285/70R17",
    "lista": "TOURADOR",
    "fila": 87,
    "precioConIva": 185
  },
  {
    "codigo": "A0456",
    "medida": "285/70R17",
    "lista": "SUMAXX AT",
    "fila": 88,
    "precioConIva": 139
  },
  {
    "codigo": "A0457",
    "medida": "285/70R17",
    "lista": "SUMAXX RT",
    "fila": 89,
    "precioConIva": 159
  },
  {
    "codigo": "A0168",
    "medida": "285/70R17",
    "lista": "HAIDA HD828",
    "fila": 90,
    "precioConIva": 162
  },
  {
    "codigo": "A0047",
    "medida": "225/40R18",
    "lista": "FALKEN",
    "fila": 93,
    "precioConIva": 119
  },
  {
    "codigo": "A0049",
    "medida": "225/45R18",
    "lista": "FALKEN",
    "fila": 94,
    "precioConIva": 119
  },
  {
    "codigo": "A0138",
    "medida": "225/55R18",
    "lista": "HAIDA HD837",
    "fila": 95,
    "precioConIva": 79
  },
  {
    "codigo": "A0543",
    "medida": "225/55R18",
    "lista": "WINRUN",
    "fila": 97,
    "precioConIva": 92
  },
  {
    "codigo": "A0368",
    "medida": "255/35R18",
    "lista": "MAXXIS",
    "fila": 99,
    "precioConIva": 99
  },
  {
    "codigo": "A0287",
    "medida": "255/55R18",
    "lista": "KENDA KR50",
    "fila": 101,
    "precioConIva": 139
  },
  {
    "codigo": "350250",
    "medida": "255/55R18",
    "lista": "FALKEN AT TRAIL",
    "fila": 102,
    "precioConIva": 190
  },
  {
    "codigo": "A0288",
    "medida": "255/60R18",
    "lista": "KENDA KR608",
    "fila": 103,
    "precioConIva": 180
  },
  {
    "codigo": "A0160",
    "medida": "265/60R18",
    "lista": "HAIDA HD829",
    "fila": 104,
    "precioConIva": 139
  },
  {
    "codigo": "A0293",
    "medida": "265/60R18",
    "lista": "KENDA KR628",
    "fila": 105,
    "precioConIva": 150
  },
  {
    "codigo": "A0559",
    "medida": "265/60R18",
    "lista": "WINRUN",
    "fila": 106,
    "precioConIva": 139
  },
  {
    "codigo": "A0453",
    "medida": "265/65R18",
    "lista": "SUMAXX",
    "fila": 107,
    "precioConIva": 132
  },
  {
    "codigo": "A0157",
    "medida": "255/45R20",
    "lista": "HAIDA",
    "fila": 109,
    "precioConIva": 105
  },
  {
    "codigo": "A0076",
    "medida": "255/50R20",
    "lista": "FALKEN AT",
    "fila": 110,
    "precioConIva": 220
  },
  {
    "codigo": "A0468",
    "medida": "265/50R20",
    "lista": "TOURADOR",
    "fila": 112,
    "precioConIva": 145
  },
  {
    "codigo": "A0558",
    "medida": "265/50R20",
    "lista": "WINRUN",
    "fila": 113,
    "precioConIva": 145
  },
  {
    "codigo": "K429B056",
    "medida": "265/50R20",
    "lista": "KENDA KR628",
    "fila": 114,
    "precioConIva": 199
  },
  {
    "codigo": "A0545",
    "medida": "225/60R18",
    "lista": "WINRUN R380",
    "fila": 118,
    "precioConIva": 75
  },
  {
    "codigo": "A0251",
    "medida": "225/60R18",
    "lista": "KENDA KR605",
    "fila": 119,
    "precioConIva": 115
  },
  {
    "codigo": "335821",
    "medida": "225/60R18",
    "lista": "FALKEN",
    "fila": 120,
    "precioConIva": 169
  },
  {
    "codigo": "A0256",
    "medida": "235/50R18",
    "lista": "KENDA",
    "fila": 121,
    "precioConIva": 119
  },
  {
    "codigo": "350240",
    "medida": "235/50R18",
    "lista": "FALKEN AT",
    "fila": 123,
    "precioConIva": 169
  },
  {
    "codigo": "TOW-069",
    "medida": "235/60R18",
    "lista": "TOWNHALL",
    "fila": 124,
    "precioConIva": 79
  },
  {
    "codigo": "A0552",
    "medida": "235/65R18",
    "lista": "WINRUN HT2",
    "fila": 125,
    "precioConIva": 119
  },
  {
    "codigo": "350248",
    "medida": "245/60R18",
    "lista": "FALKEN AT",
    "fila": 126,
    "precioConIva": 179
  },
  {
    "codigo": "A0081",
    "medida": "265/65R18",
    "lista": "FALKEN AT4W",
    "fila": 128,
    "precioConIva": 299
  },
  {
    "codigo": "K320B965",
    "medida": "225/45R19",
    "lista": "KENDA",
    "fila": 130,
    "precioConIva": 129
  },
  {
    "codigo": "A0050",
    "medida": "225/45R19",
    "lista": "FALKEN",
    "fila": 131,
    "precioConIva": 179
  },
  {
    "codigo": "A0139",
    "medida": "225/55R19",
    "lista": "HAIDA",
    "fila": 132,
    "precioConIva": 99
  },
  {
    "codigo": "A0261",
    "medida": "235/55R19",
    "lista": "KENDA KR608",
    "fila": 133,
    "precioConIva": 160
  },
  {
    "codigo": "A0062",
    "medida": "235/55R19",
    "lista": "FALKEN",
    "fila": 134,
    "precioConIva": 189
  },
  {
    "codigo": "A0158",
    "medida": "255/55R19",
    "lista": "HAIDA",
    "fila": 136,
    "precioConIva": 99
  },
  {
    "codigo": "A0326",
    "medida": "255/55R19",
    "lista": "KENDA KR608",
    "fila": 137,
    "precioConIva": 179
  },
  {
    "codigo": "A0555",
    "medida": "255/55R19",
    "lista": "WINRUN AT",
    "fila": 139,
    "precioConIva": 169
  },
  {
    "codigo": "A0285",
    "medida": "255/35R20",
    "lista": "KENDA KR20",
    "fila": 141,
    "precioConIva": 120
  },
  {
    "codigo": "A0274",
    "medida": "245/35R20",
    "lista": "KENDA KR20",
    "fila": 143,
    "precioConIva": 130
  },
  {
    "codigo": "A0276",
    "medida": "245/45R20",
    "lista": "KENDA KR605",
    "fila": 144,
    "precioConIva": 150
  },
  {
    "codigo": "A0307",
    "medida": "275/45R20",
    "lista": "KENDA KR605",
    "fila": 145,
    "precioConIva": 159
  },
  {
    "codigo": "A0564",
    "medida": "275/45R20",
    "lista": "WINRUN",
    "fila": 146,
    "precioConIva": 129
  },
  {
    "codigo": "A0172",
    "medida": "275/55R20",
    "lista": "HAIDA HD829",
    "fila": 147,
    "precioConIva": 159
  },
  {
    "codigo": "A0308",
    "medida": "275/55R20",
    "lista": "KENDA",
    "fila": 149,
    "precioConIva": 215
  },
  {
    "codigo": "A0455",
    "medida": "285/55R20",
    "lista": "SUMAXX",
    "fila": 151,
    "precioConIva": 159
  },
  {
    "codigo": "A0566",
    "medida": "33X12.5R20",
    "lista": "WINRUN",
    "fila": 154,
    "precioConIva": 235
  },
  {
    "codigo": "36625028",
    "medida": "35X12.5R20",
    "lista": "KENDA KR629",
    "fila": 155,
    "precioConIva": 330
  }
];

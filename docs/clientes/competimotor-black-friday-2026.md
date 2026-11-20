# Black Friday Competimotor — cruce con el inventario (20-nov-2026)

Generado por `app/scripts/competimotor/black-friday.ts` con `INV_NOV.XLS` (Fénix, sin fecha) y `LLANTAS BLACK FRIDAY.xlsx` (hoja «Hoja1»).

- Filas con precio en la lista: **138**
- Cruzaron con UN artículo de Fénix: **119** → el bot les pone precio Black Friday a **116**; 1 con precio Black Friday ≥ P2 (sin descuento) y 2 con un descuento de más de 40 % que parece tipeo (se revisan con Carlos; hasta entonces van a P2).
- Sin cruzar (no se adivinan; el bot las cotiza a P2 como siempre): **19**

## ¿El precio de Black Friday viene con IVA?

De las 119 que cruzaron: el precio de la lista es, en la mediana, 81 % del P2, 89 % del P3 y 93 % del Precio D (mayorista).
- Tal cual viene: 118 de 119 quedan por debajo del P3 y 116 por debajo del Precio D.
- Si se le sumara el 15 %: 39 quedarían bajo el P3, 76 entre P3 y P2, y 4 en P2 o más (sin descuento).

**Conclusión: el precio de Black Friday YA trae IVA (es el precio final por llanta, con servicios).** Tal cual, casi todas quedan por debajo de todas las listas (P2 con tarjeta y P3 en efectivo): es lo que se espera de una promoción. Si fuera sin IVA, al sumarle el 15 % 80 de 119 saldrían MÁS caras que el precio normal en efectivo (P3) y 4 más caras que con tarjeta: un Black Friday peor que un día cualquiera. Además son precios redondos de vitrina (terminan en 9, 5 o 0: $39, $49, $199), mientras que Fénix guarda los sin-IVA como entero × 1,15 ($47,15 = $41 × 1,15). Lo único que llama la atención: 116 quedan por debajo del Precio D (mayorista); vale confirmarlo con Carlos, pero no cambia la conclusión.

## Cruzaron

| Fila | Sección | Medida | Lista dice | Artículo de Fénix | Código | P2 | P3 | Black Friday | Ahorro c/u | Stock |
|---|---|---|---|---|---|---|---|---|---|---|
| 7 | jue–lun | 185/60R13 | MAXXIS MP10 | MAXXIS 185/60R13 MP10 80H | `R13/185/60 MAXXIS MP1` | $62.99 | $56.99 | **$53.00** | $9.99 | 2 |
| 8 | jue–lun | 185/70R13 | CONTINENTAL | CONTINENTAL 185/70R13 POWERCONTAC 2 | `A0006` | $99.00 | $89.00 | **$80.00** | $19.00 | 6 |
| 10 | jue–lun | 165/60R14 | GENERAL | GENERAL 165/60R14 ALTIMAX | `A0099` | $81.65 | $74.75 | **$66.00** | $15.65 | 4 |
| 11 | jue–lun | 165/60R14 | KENDA | KENDA 165/60R14 KR23 | `A0206` | $71.30 | $64.40 | **$59.00** | $12.30 | 8 |
| 12 | jue–lun | 175/70R14 | TOWNHALL | TOWNHALL 175/70R14 TH-161 84T | `TOW-030` | $47.00 | $43.00 | **$39.00** | $8.00 | 4 |
| 13 | jue–lun | 175/70R14 | KENDA | KENDA 175/70R14 KR203 | `A0210` | $71.30 | $64.40 | **$55.00** | $16.30 | 7 |
| 14 | jue–lun | 185/60R14 | KENDA KR20 | KENDA 185/60R14 KR20 | `1485` | $84.99 | $79.00 | **$68.00** | $16.99 | 19 |
| 15 | jue–lun | 185/65R14 | TOWNHALL TH161 | TOWNHALL 185/65R14 TH-161 86H | `A0477` | $49.45 | $44.85 | **$42.00** | $7.45 | 101 |
| 16 | jue–lun | 195/70R14 | OPALS | OPALS 195/70R14 FH666 91H | `R14/195/70 OPALS` | $64.99 | $59.99 | **$55.00** | $9.99 | 8 |
| 17 | jue–lun | 195/70R14 | KAPSEN | KAPSEN 195/70R14 HD918 | `A0200` | $62.10 | $56.35 | **$51.00** | $11.10 | 8 |
| 18 | jue–lun | 205/60R14 | NEREUS | NEREUS 205/60R14 NS601 88H | `R14/205/60 NEREUS NS6` | $69.00 | $62.99 | **$55.00** | $14.00 | 4 |
| 19 | jue–lun | 195R14 | TRAZANO | TRAZANO 195R14C H188 8PR | `A0505` | $98.90 | $89.70 | **$75.00** | $23.90 | 4 |
| 21 | jue–lun | 215/75R14 | WINRUN | WINRUN 215/75R14LT MAXCLAW AT | `A0542` | $120.75 | $109.25 | **$99.00** | $21.75 | 7 |
| 22 | jue–lun | 215/75R14 | LINLONG (marca escrita «LINLONG») | LINGLONG 215/75R14C R666 8PR | `1857` | $96.99 | $89.00 | **$82.00** | $14.99 | 4 |
| 23 | jue–lun | 215/75R14 | KENDA | KENDA 215/75R14C KR33A 8PR | `A0241` | $128.80 | $117.30 | **$100.00** | $28.80 | 4 |
| 25 | jue–lun | 185/55R15 | HAIDA HD921 | HAIDA 185/55R15 HD921 | `A0112` | $75.00 | $67.99 | **$59.00** | $16.00 | 8 |
| 26 | jue–lun | 185/65R15 | HAIDA RUNSPIRIT | HAIDA 185/65R15 RUNSPIRIT 88H | `A0116` | $62.10 | $56.35 | **$52.00** | $10.10 | 9 |
| 27 | jue–lun | 195/50R15 | TOWNHALL | TOWNHALL 195/50R15 TH-161 82V | `A0478` | $59.80 | $54.05 | **$48.00** | $11.80 | 12 |
| 28 | jue–lun | 195/60R15 | CONTINENTAL | CONTINENTAL 195/60R15 POWERCONTACT 2 | `A0700` | $104.99 | $95.00 | **$90.00** | $14.99 | 2 |
| 29 | jue–lun | 195R15 | KENDA | KENDA 195R15C 8PR KR33 | `A0226` | $131.10 | $119.60 | **$100.00** | $31.10 | 7 |
| 31 | jue–lun | 215/75R15 | FALKEN AT4W | FALKEN 215/75R15LT WILDPEAK A/T4W 106/103R | `356518` | $237.99 | $219.99 | **$198.00** | $39.99 | 4 |
| 32 | jue–lun | 225/70R15 | KENDA KR33 | KENDA 225/70R15C KR33A 8PR | `A0253` | $143.75 | $129.95 | **$109.00** | $34.75 | 6 |
| 33 | jue–lun | 225/70R15 | HAIDA HD737 | HAIDA 225/70R15C HD737 10PR | `A0142` | $101.20 | $92.00 | **$85.00** | $16.20 | 6 |
| 34 | jue–lun | 235/75R15 | FALKEN AT4W | FALKEN 235/75R15 WILDPEAK AT4W | `A0068` | $247.25 | $224.25 | **$200.00** | $47.25 | 4 |
| 35 | jue–lun | 245/60R15 | COOPER | COOPER 245/60R15 COBRA RADIAL GT LB | `A0010` | $148.35 | $134.55 | **$125.00** | $23.35 | 7 |
| 36 | jue–lun | 30X9.5R15 | FALKEN MT | FALKEN 30X9.5R15LT WILDPEAK M/T | `A0092` | $278.30 | $253.00 | **$220.00** | $58.30 | 8 |
| 37 | jue–lun | 30X9.5R15 | KENDA KR628 | KENDA 30X9.5R15LT KR628 LB 104Q 6PR | `A0318` | $202.40 | $184.00 | **$165.00** | $37.40 | 8 |
| 38 | jue–lun | 31X10.5R15 | KENDA KR628 | KENDA 31X10.5R15LT KR628 109Q 6PR | `A0321` | $213.90 | $194.35 | **$179.00** | $34.90 | 10 |
| 39 | jue–lun | 31X10.5R15 | KENDA KR29 | KENDA 31X10.5R15LT KR29 MT 109Q 6PR | `A0320` | $213.90 | $194.35 | **$183.00** | $30.90 | 12 |
| 40 | jue–lun | 7.00R15 | KENDA KR12 | KENDA 700R15 KR12 12PR | `A0324` | $170.20 | $154.10 | **$138.00** | $32.20 | 17 |
| 42 | jue–lun | 195/45R16 | HAIDA HD921 | HAIDA 195/45R16 HD921 | `A0119` | $65.55 | $59.80 | **$49.00** | $16.55 | 4 |
| 43 | jue–lun | 195/45R16 | KENDA KR20 | KENDA 195/45R16 KR20 | `A0218` | $111.55 | $101.20 | **$89.00** | $22.55 | 8 |
| 45 | jue–lun | 205/55R16 | HAIDA RUNSPIRIT | HAIDA 205/55R16 RUNSPIRIT | `A0129` | $65.55 | $59.80 | **$50.00** | $15.55 | 14 |
| 46 | jue–lun | 205/55R16 | TOWNHALL | TOWNHALL 205/55R16 TH161 | `A0481` | $62.10 | $56.35 | **$49.00** | $13.10 | 22 |
| 47 | jue–lun | 205/55R16 | XBRI ECOLOGY | XBRI 205/55R16 ECOLOGY 91V | `A0572` | $65.55 | $59.80 | **$48.00** | $17.55 | 4 |
| 48 | jue–lun | 215/70R16 | XBRI HT2 | XBRI 215/70R16 FORZA HT 2 100H | `A0575` | $120.75 | $109.25 | **$100.00** | $20.75 | 8 |
| 49 | jue–lun | 215/70R16 | KENDA KR50 | KENDA 215/70R16 KR50 | `A0240` | $141.45 | $128.80 | **$110.00** | $31.45 | 4 |
| 50 | jue–lun | 235/60R16 | DURUN HG918 | DURUN 235/60R16 HG918 | `A0025` | $87.40 | $79.35 | **$70.00** | $17.40 | 12 |
| 51 | jue–lun | 235/70R16 | FALKEN AT4W | FALKEN 235/70R16 WILDPEAK AT4W | `A0067` | $223.10 | $202.40 | **$182.00** | $41.10 | 6 |
| 52 | jue–lun | 245/70R16 | DURUN RT02 | DURUN 245/70R16 RT02 LB | `A0029` | $158.70 | $144.90 | **$129.00** | $29.70 | 4 |
| 53 | jue–lun | 245/75R16 | CONTINENTAL AT50 | CONTINENTAL 245/75R16LT AT50 | `1645` | $242.00 | $222.99 | **$110.00** ⚠️ revisar | $132.00 | 4 |
| 54 | jue–lun | 245/75R16 | KENDA KR28 | KENDA 245/75R16 KR28 AT | `A0283` | $152.95 | $139.15 | **$130.00** | $22.95 | 4 |
| 55 | jue–lun | 245/75R16 | KENDA KR29 | KENDA 245/75R16LT KR29 LB MT 120Q 10 PR | `A0284` | $235.75 | $213.90 | **$190.00** | $45.75 | 4 |
| 56 | jue–lun | 265/70R16 | WIDEWAY | WIDEWAY 265/70R16 SPEEDWAY 112H | `A0522` | $115.00 | $104.65 | **$95.00** | $20.00 | 2 |
| 58 | jue–lun | 265/75R16 | KENDA MT | KENDA 265/75R16LT KR29 MT 123/120Q 10PR | `A0305` | $274.85 | $249.55 | **$215.00** | $59.85 | 6 |
| 59 | jue–lun | 265/75R16 | HAIDA HD868 | HAIDA 265/75R16LT HD868 10PR MT | `A0166` | $192.05 | $174.80 | **$159.00** | $33.05 | 4 |
| 60 | jue–lun | 275/70R16 | KENDA KR28 | KENDA 275/70R16 114T KR28 | `A0310` | $235.75 | $213.90 | **$180.00** | $55.75 | 4 |
| 61 | jue–lun | 285/75R16 | KENDA KR29 | KENDA 285/75R16LT  KR29 10PR MT | `A0317` | $324.30 | $294.40 | **$273.00** | $51.30 | 2 |
| 64 | jue–lun | 205/45R17 | KENDA KR41 | KENDA 205/45R17 Z KR41 TL 88W | `K416B739` | $90.99 | $84.00 | **$72.00** | $18.99 | 4 |
| 66 | jue–lun | 225/65R17 | FALKEN ZE310 | FALKEN 225/65R17 ZE310R | `A0058` | $180.55 | $164.45 | **$145.00** | $35.55 | 8 |
| 67 | jue–lun | 225/65R17 | FALKEN AT4W | FALKEN 225/65R17 WILDPEAK AT4W 106T JAPONESA | `A0057` | $241.50 | $219.65 | **$199.00** | $42.50 | 8 |
| 68 | jue–lun | 235/45R17 | DURUN | DURUN 235/45R17 M636 | `A0023` | $75.90 | $69.00 | **$59.00** | $16.90 | 6 |
| 69 | jue–lun | 235/55R17 | KENDA KR50 | KENDA 235/55R17 103H KR50 | `A0257` | $136.85 | $124.20 | **$115.00** | $21.85 | 6 |
| 71 | jue–lun | 235/60R17 | WINRUN R380 | WINRUN 235/60R17 R380 | `A0550` | $120.75 | $109.25 | **$99.00** | $21.75 | 8 |
| 72 | jue–lun | 235/65R17 | DURUN RT02 | DURUN 235/65R17 RT02 LB | `A0027` | $170.00 | $154.99 | **$139.00** | $31.00 | 8 |
| 73 | jue–lun | 235/65R17 | KENDA KR50 | KENDA 235/65R17  KR50 | `A0267` | $152.95 | $139.15 | **$122.00** | $30.95 | 4 |
| 74 | jue–lun | 235/65R17 | KENDA KR28 | KENDA 235/65R17  KR28 | `A0266` | $148.35 | $134.55 | **$129.00** | $19.35 | 8 |
| 75 | jue–lun | 235/65R17 | TOURADOR FORCE AT | TOURADOR 235/65R17 FORCE A/T 108T XL X | `TOU-047` | $125.99 | $115.00 | **$109.00** | $16.99 | 8 |
| 76 | jue–lun | 245/75R17 | TOURADOR FORCE AT | TOURADOR 245/75R17LT FORCE A/T II 121/118S/BZ | `TOU-048` | $179.00 | $162.99 | **$155.00** | $24.00 | 8 |
| 77 | jue–lun | 265/65R17 | DURUN RT02 | DURUN 265/65R17 RT02 LB | `A0032` | $185.15 | $167.90 | **$139.00** | $46.15 | 6 |
| 78 | jue–lun | 265/65R17 | WINRUN RT | WINRUN 265/65R17 MAXCLAW R/T 112T | `A0561` | $175.95 | $159.85 | **$139.00** | $36.95 | 8 |
| 79 | jue–lun | 265/65R17 | WINRUN MAXCLAW AT | WINRUN 265/65R17 MAXCLAW A/T 112T | `A0560` | $164.45 | $149.50 | **$135.00** | $29.45 | 6 |
| 80 | jue–lun | 265/65R17 | TOWNHALL | TOWNHALL 265/65R17 TH-AT802 | `A0496` | $156.40 | $142.60 | **$130.00** | $26.40 | 10 |
| 81 | jue–lun | 265/65R17 | KENDA KR601 | KENDA 265/65R17LT KR601 10PR  RT | `A0296` | $257.60 | $234.60 | **$199.00** | $58.60 | 4 |
| 82 | jue–lun | 265/70R17 | COOPER MT | COOPER 265/70R17LT MT EVOLUTION 10PR | `A0012` | $233.45 | $212.75 | **$180.00** | $53.45 | 2 |
| 83 | jue–lun | 265/70R17 | FALKEN MT | FALKEN 265/70R17LT WILDPEAK MT 10PR | `A0084` | $328.90 | $299.00 | **$250.00** | $78.90 | 8 |
| 84 | jue–lun | 265/70R17 | TOWNHALL | TOWNHALL 265/70R17 TH-AT802 115T | `TOW-023` | $144.00 | $130.00 | **$119.00** | $25.00 | 12 |
| 85 | jue–lun | 275/70R17 | KENDA 608 | KENDA 275/70R17LT KR608 LB 121/118R 10PR | `A0311` | $289.80 | $263.35 | **$235.00** | $54.80 | 4 |
| 86 | jue–lun | 285/65R17 | KENDA KR28 | KENDA 285/65R17 KR28 116T | `A0314` | $257.60 | $234.60 | **$199.00** | $58.60 | 4 |
| 87 | jue–lun | 285/70R17 | TOURADOR | TOURADOR 285/70R17LT FORCE A/T II 10PR 121/118R/BZ X | `TOU-037` | $214.99 | $194.99 | **$185.00** | $29.99 | 8 |
| 88 | jue–lun | 285/70R17 | SUMAXX AT | SUMAXX 285/70R17LT AT ALL TERRAIN 10PR | `A0456` | $164.45 | $149.50 | **$139.00** | $25.45 | 5 |
| 89 | jue–lun | 285/70R17 | SUMAXX RT | SUMAXX 285/70R17LT MAX RANGER RT 10PR | `A0457` | $184.00 | $167.90 | **$159.00** | $25.00 | 4 |
| 90 | jue–lun | 285/70R17 | HAIDA HD828 | HAIDA 285/70R17LT AT HD828 10PR 121/118R | `A0168` | $186.30 | $169.05 | **$162.00** | $24.30 | 6 |
| 93 | jue–lun | 225/40R18 | FALKEN | FALKEN 225/40R18 ZE310R | `A0047` | $150.65 | $136.85 | **$119.00** | $31.65 | 4 |
| 94 | jue–lun | 225/45R18 | FALKEN | FALKEN 225/45R18 ZE310R | `A0049` | $158.70 | $144.90 | **$119.00** | $39.70 | 4 |
| 95 | jue–lun | 225/55R18 | HAIDA HD837 | HAIDA 225/55R18 HD837 98V | `A0138` | $98.90 | $89.70 | **$79.00** | $19.90 | 6 |
| 97 | jue–lun | 225/55R18 | WINRUN | WINRUN 225/55R18 R330  98V | `A0543` | $115.00 | $104.65 | **$92.00** | $23.00 | 4 |
| 98 | jue–lun | 245/45R18 | KENDA KR41 | KENDA 245/45R18 KR41 TL 100W | `K421B849` | $124.00 | $115.00 | **$199.00** ⚠️ ≥ P2 | — | 4 |
| 99 | jue–lun | 255/35R18 | MAXXIS | MAXXIS 255/35R18 MAZ4 | `A0368` | $150.65 | $136.85 | **$99.00** | $51.65 | 2 |
| 101 | jue–lun | 255/55R18 | KENDA KR50 | KENDA 255/55R18 KR50 109H | `A0287` | $170.20 | $154.10 | **$139.00** | $31.20 | 6 |
| 102 | jue–lun | 255/55R18 | FALKEN AT TRAIL | FALKEN 255/55R18 WILDPEAK A/T TRAIL XL 109V | `350250` | $233.00 | $214.99 | **$190.00** | $43.00 | 4 |
| 103 | jue–lun | 255/60R18 | KENDA KR608 | KENDA 255/60R18LT KR608 CARGA 10PR | `A0288` | $247.25 | $224.25 | **$180.00** | $67.25 | 4 |
| 104 | jue–lun | 265/60R18 | HAIDA HD829 | HAIDA 265/60R18LT HD829 10PR | `A0160` | $164.45 | $149.50 | **$139.00** | $25.45 | 4 |
| 105 | jue–lun | 265/60R18 | KENDA KR628 | KENDA 265/60R18 114T KR628 | `A0293` | $197.80 | $179.40 | **$150.00** | $47.80 | 8 |
| 106 | jue–lun | 265/60R18 | WINRUN | WINRUN 265/60R18 MAXCLAW AT | `A0559` | $167.90 | $152.95 | **$139.00** | $28.90 | 6 |
| 107 | jue–lun | 265/65R18 | SUMAXX | SUMAXX 265/65R18 ALL TERRAIN LB | `A0453` | $162.15 | $147.20 | **$132.00** | $30.15 | 12 |
| 109 | jue–lun | 255/45R20 | HAIDA | HAIDA 255/45R20  HD937 | `A0157` | $131.10 | $119.60 | **$105.00** | $26.10 | 16 |
| 110 | jue–lun | 255/50R20 | FALKEN AT | FALKEN 255/50R20 AT-TRAIL WILDPEAK | `A0076` | $264.50 | $240.35 | **$220.00** | $44.50 | 4 |
| 111 | jue–lun | 255/50R20 | FALKEN AZENIS | FALKEN 255/50R20 AZENIS FK520L | `A0077` | $263.35 | $239.20 | **$115.00** ⚠️ revisar | $148.35 | 4 |
| 112 | jue–lun | 265/50R20 | TOURADOR | TOURADOR 265/50R20 FORCE AT2 | `A0468` | $169.05 | $152.95 | **$145.00** | $24.05 | 12 |
| 113 | jue–lun | 265/50R20 | WINRUN | WINRUN 265/50R20 MAXCLAW AT | `A0558` | $186.30 | $169.05 | **$145.00** | $41.30 | 4 |
| 114 | jue–lun | 265/50R20 | KENDA KR628 | KENDA 265/50R20 KR628 TL XL 111H | `K429B056` | $231.99 | $214.99 | **$199.00** | $32.99 | 4 |
| 118 | todo el mes | 225/60R18 | WINRUN R380 | WINRUN 225/60R18 R380 104V XL | `A0545` | $98.90 | $89.70 | **$75.00** | $23.90 | 10 |
| 119 | todo el mes | 225/60R18 | KENDA KR605 | KENDA 225/60R18 100V KR605 | `A0251` | $148.35 | $134.55 | **$115.00** | $33.35 | 4 |
| 120 | todo el mes | 225/60R18 | FALKEN | FALKEN 225/60R18 ZIEX CT60 A/S | `335821` | $205.00 | $188.00 | **$169.00** | $36.00 | 4 |
| 121 | todo el mes | 235/50R18 | KENDA | KENDA 235/50R18 101W KR605 | `A0256` | $148.35 | $134.55 | **$119.00** | $29.35 | 8 |
| 123 | todo el mes | 235/50R18 | FALKEN AT | FALKEN 235/50R18 WILDPEAK A/T TRAIL 97V | `350240` | $202.00 | $187.00 | **$169.00** | $33.00 | 4 |
| 124 | todo el mes | 235/60R18 | TOWNHALL | TOWNHALL 235/60R18 TH-HP802  107VXL | `TOW-069` | $98.00 | $90.00 | **$79.00** | $19.00 | 8 |
| 125 | todo el mes | 235/65R18 | WINRUN HT2 | WINRUN 235/65R18 WAXCLAW H/T2 | `A0552` | $142.60 | $129.95 | **$119.00** | $23.60 | 7 |
| 126 | todo el mes | 245/60R18 | FALKEN AT | FALKEN 245/60R18 WILDPEAK A/T TRAIL 105H | `350248` | $222.00 | $205.00 | **$179.00** | $43.00 | 4 |
| 128 | todo el mes | 265/65R18 | FALKEN AT4W | FALKEN 265/65R18LT WILDPEAK AT4W | `A0081` | $340.40 | $309.35 | **$299.00** | $41.40 | 4 |
| 130 | todo el mes | 225/45R19 | KENDA | KENDA 225/45R19 Z KR605 TL XL 96W | `K320B965` | $153.00 | $142.00 | **$129.00** | $24.00 | 4 |
| 131 | todo el mes | 225/45R19 | FALKEN | FALKEN 225/45R19 AZENIS FK520L 96Y XL JAPONESA | `A0050` | $205.85 | $187.45 | **$179.00** | $26.85 | 4 |
| 132 | todo el mes | 225/55R19 | HAIDA | HAIDA 225/55R19 HD937 | `A0139` | $126.50 | $115.00 | **$99.00** | $27.50 | 8 |
| 133 | todo el mes | 235/55R19 | KENDA KR608 | KENDA 235/55R19LT KR608 10PR 111/108T | `A0261` | $235.75 | $213.90 | **$160.00** | $75.75 | 16 |
| 134 | todo el mes | 235/55R19 | FALKEN | FALKEN 235/55R19 CT60AS | `A0062` | $230.00 | $209.30 | **$189.00** | $41.00 | 6 |
| 136 | todo el mes | 255/55R19 | HAIDA | HAIDA 255/55R19 HD927 | `A0158` | $120.75 | $109.25 | **$99.00** | $21.75 | 8 |
| 137 | todo el mes | 255/55R19 | KENDA KR608 | KENDA LT255/55R19 KR608 10PR CARGA | `A0326` | $269.10 | $244.95 | **$179.00** | $90.10 | 8 |
| 139 | todo el mes | 255/55R19 | WINRUN AT | WINRUN 255/55R19 MAXCLAW A/T | `A0555` | $223.10 | $202.40 | **$169.00** | $54.10 | 4 |
| 141 | todo el mes | 255/35R20 | KENDA KR20 | KENDA 255/35R20 KR20 | `A0285` | $158.70 | $144.90 | **$120.00** | $38.70 | 4 |
| 143 | todo el mes | 245/35R20 | KENDA KR20 | KENDA 245/35R20 KR20 | `A0274` | $180.55 | $164.45 | **$130.00** | $50.55 | 4 |
| 144 | todo el mes | 245/45R20 | KENDA KR605 | KENDA 245/45R20 KR605 | `A0276` | $202.40 | $184.00 | **$150.00** | $52.40 | 4 |
| 145 | todo el mes | 275/45R20 | KENDA KR605 | KENDA 275/45R20 KR605 | `A0307` | $192.05 | $174.80 | **$159.00** | $33.05 | 8 |
| 146 | todo el mes | 275/45R20 | WINRUN | WINRUN 275/45R20 R330 | `A0564` | $158.70 | $144.90 | **$129.00** | $29.70 | 4 |
| 147 | todo el mes | 275/55R20 | HAIDA HD829 | HAIDA LT275/55R20 HD829 10PR | `A0172` | $192.05 | $174.80 | **$159.00** | $33.05 | 4 |
| 149 | todo el mes | 275/55R20 | KENDA | KENDA 275/55R20 117T KR628 | `A0308` | $253.00 | $230.00 | **$215.00** | $38.00 | 4 |
| 151 | todo el mes | 285/55R20 | SUMAXX | SUMAXX 285/55R20 ALL TERRAIN AT | `A0455` | $186.30 | $169.05 | **$159.00** | $27.30 | 6 |
| 154 | todo el mes | 33X12.5R20 | WINRUN | WINRUN 33X12.5R20LT MT305 | `A0566` | $277.15 | $251.85 | **$235.00** | $42.15 | 4 |
| 155 | todo el mes | 35X12.5R20 | KENDA KR629 | KENDA 35X12.50R20LT KR629 12PR 125Q | `36625028` | $414.00 | $383.99 | **$330.00** | $84.00 | 4 |

## Precio Black Friday ≥ P2 (ahí no hay descuento: el bot NO las marca como Black Friday)

- Fila 98: KENDA KR41 245/45R18 → KENDA 245/45R18 KR41 TL 100W: Black Friday $199.00 contra P2 $124.00

## Precio raro: más de 40 % bajo el P2 (NO se prenden hasta que Carlos los confirme)

- Fila 53: CONTINENTAL AT50 245/75R16 → CONTINENTAL 245/75R16LT AT50 (`1645`): Black Friday $110.00 contra P2 $242.00 (55 % menos)
- Fila 111: FALKEN AZENIS 255/50R20 → FALKEN 255/50R20 AZENIS FK520L (`A0077`): Black Friday $115.00 contra P2 $263.35 (56 % menos)

## Sin cruzar

| Fila | Sección | Medida | Lista dice | Precio | Por qué |
|---|---|---|---|---|---|
| 20 | jue–lun | 215R14 | ILINK | $82.00 | medida que no se lee: «215R14» no se lee como medida |
| 30 | jue–lun | 215/75R15 | LINGLONG LM33 AT | $73.00 | ningún modelo calza: ningún LINGLONG 215/75R15 trae «LM33 AT» (hay: LINGLONG 215/75R15 LMB3 AT) |
| 44 | jue–lun | 205/55R16 | HAIDA HDEXCOMFORT | $52.00 | ningún modelo calza: ningún HAIDA 205/55R16 trae «HDEXCOMFORT» (hay: HAIDA 205/55R16 HD665 / HAIDA 205/55R16 HDEXCONFORT / HAIDA 205/55R16 RUNSPIRIT) |
| 57 | jue–lun | 265/70R16 | DURUN KR325 | $149.00 | ningún modelo calza: ningún DURUN 265/70R16 trae «KR325» (hay: DURUN 265/70R16 K325 AT) |
| 63 | jue–lun | 205/45R17 | DURUN RUDS | $49.00 | ningún modelo calza: ningún DURUN 205/45R17 trae «RUDS» (hay: DURUN 205/45R17 RU05) |
| 65 | jue–lun | 225/55R17 | FALKEN AZENIS | $135.00 | ningún modelo calza: ningún FALKEN 225/55R17 trae «AZENIS» (hay: FALKEN 225/55R17 AT-TRAIL / FALKEN 225/55R17 ZE310R) |
| 70 | jue–lun | 235/60R17 | FALKEN ZE310 | $149.00 | ningún modelo calza: ningún FALKEN 235/60R17 trae «ZE310» (hay: FALKEN 235/60R17 ZIEX CT60 A/S) |
| 91 | jue–lun | 35X12.5R17 | WINRUN MT | $230.00 | ningún modelo calza: ningún WINRUN 35X12.5R17 trae «MT» (hay: WINRUN 35X12.50R17LT MT305 121Q) |
| 96 | jue–lun | 225/55R18 | FALKEN AZENIS | $139.00 | ningún modelo calza: ningún FALKEN 225/55R18 trae «AZENIS» (hay: FALKEN 225/55R18 ZE310R) |
| 100 | jue–lun | 255/55R18 | LINLGLONG CAT | $99.00 | ningún modelo calza: ningún LINGLONG 255/55R18 trae «CAT» (hay: LINGLONG 255/55R18 CROSSWIND AT) |
| 122 | todo el mes | 235/50R18 | FALKEN AZENIS | $155.00 | ningún modelo calza: ningún FALKEN 235/50R18 trae «AZENIS» (hay: FALKEN 235/50R18 WILDPEAK A/T TRAIL 97V / FALKEN 235/50R18 ZE310R) |
| 127 | todo el mes | 245/60R18 | FALKEN CT60AS | $175.00 | ningún modelo calza: ningún FALKEN 245/60R18 trae «CT60AS» (hay: FALKEN 245/60R18 WILDPEAK A/T TRAIL 105H / FALKEN 245/60R18 ZIEX CT60 A/S 105V) |
| 135 | todo el mes | 255/50R19 | FALKEN | $175.00 | calza con más de una: «FALKEN» calza con 2: FALKEN 255/50R19 CT60AS / FALKEN 255/50R19 WILDPEAK A/T TRAIL XL 107V |
| 138 | todo el mes | 255/55R19 | WINRUN | $129.00 | calza con más de una: «WINRUN» calza con 2: WINRUN 255/55R19 MAXCLAW A/T / WINRUN 255/55R19 R330 |
| 142 | todo el mes | 235/55R20 | WINRUN HT | $109.00 | esa marca no está en esa medida: no hay WINRUN en 235/55R20 (en esa medida hay: WNRUN) |
| 148 | todo el mes | 275/55R20 | SUMAXX | $149.00 | esa marca no está en esa medida: no hay SUMAXX en 275/55R20 (en esa medida hay: HAIDA, KENDA) |
| 150 | todo el mes | 275/65R20 | HAIDA HD878 | $169.00 | ningún modelo calza: ningún HAIDA 275/65R20 trae «HD878» (hay: HAIDA LT275/65R20 HD868 10PR MT) |
| 152 | todo el mes | 33X12.5R20 | FALKEN MT | $395.00 | ningún modelo calza: ningún FALKEN 33X12.5R20 trae «MT» (hay: FALKEN 33X12.50R20LT WILDPEAK R/T01 114R / FALKEN 33X12.5R20 WILDPEAL MT01 10PR) |
| 153 | todo el mes | 33X12.5R20 | FALKEN RT | $399.00 | ningún modelo calza: ningún FALKEN 33X12.5R20 trae «RT» (hay: FALKEN 33X12.50R20LT WILDPEAK R/T01 114R / FALKEN 33X12.5R20 WILDPEAL MT01 10PR) |

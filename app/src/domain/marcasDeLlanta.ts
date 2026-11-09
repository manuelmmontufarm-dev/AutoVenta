/**
 * Marcas de llanta que un cliente puede nombrar — las que el negocio vende y las
 * que llegan a WhatsApp porque las tiene puestas o las vio en otra vitrina.
 *
 * UNA sola lista (antes había dos: `MARCAS` en firstContact.ts y
 * `MARCAS_CONOCIDAS` en consultaConRespaldo.ts, y la segunda era la más
 * completa). La leen:
 *  · `firstContact.ts`: nombrar una marca es un dato de venta, no un saludo;
 *  · `consultaConRespaldo.ts`: «¿tienen Venom?» sin esa marca en catálogo;
 *  · `catalog.ts`: el buscador nunca descarta una marca que el cliente nombró.
 *
 * En minúscula y sin tildes; las de dos palabras van tal cual se escriben. Para
 * agregar una, aquí y en ningún otro sitio.
 */
export const MARCAS_DE_LLANTA_CONOCIDAS = [
  "falken", "kenda", "winrun", "giti", "aplus", "maxtrek", "sunoco",
  "michelin", "bridgestone", "goodyear", "continental", "hankook", "pirelli",
  "firestone", "toyo", "yokohama", "dunlop", "kumho", "nexen", "sailun",
  "triangle", "linglong", "general tire", "general",
  // Auditoría 2-6 sep (conv 15158: «busco 4 Venom Power 315/70R17» y el bot
  // mostró otras sin decir que esa no la maneja). Las que llegan a WhatsApp
  // porque el cliente las tiene puestas o las vio en otra vitrina.
  "venom", "maxxis", "bfgoodrich", "bf goodrich", "goodrich", "cooper", "nitto", "roadstone", "westlake",
  "sunfull", "jinyu", "ovation", "aptany", "lanvigator", "durun", "haida",
  "kapsen", "doublestar", "landsail", "goodride", "delinte", "gt radial",
  "arivo", "farroad", "wanli", "compasal", "comforser", "atturo", "achilles",
  "nankang", "federal", "sumitomo", "laufenn", "mastercraft", "uniroyal",
  "apollo", "aeolus", "chaoyang",
] as const;

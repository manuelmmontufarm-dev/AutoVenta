/**
 * Números de teléfono → WhatsApp (Manuel, 23-nov-2026): en los avisos del
 * teléfono sale el número del cliente y tiene que poder tocarse para abrir el
 * chat en WhatsApp directo, sin copiarlo a mano.
 */

/** Un número como lo escribe el bot o el asesor → solo dígitos con código de país (Ecuador por defecto). */
export function numeroParaWhatsApp(texto: string): string | null {
  const d = texto.replace(/\D/g, "");
  if (/^0\d{9}$/.test(d)) return `593${d.slice(1)}`; // 0991234567 → 593991234567
  if (/^9\d{8}$/.test(d)) return `593${d}`;          // 991234567  → 593991234567
  // Ya trae código de país (593…, 34…). Un código de país nunca empieza en 0:
  // «001-002-000012345» es un número de factura, no un teléfono.
  if (d.length >= 11 && d.length <= 15 && !d.startsWith("0")) return d;
  return null;
}

export function enlaceWhatsApp(texto: string): string | null {
  const n = numeroParaWhatsApp(texto);
  return n ? `https://wa.me/${n}` : null;
}

export type Trozo = { texto: string } | { texto: string; whatsapp: string };

/**
 * Parte una línea en texto y números de teléfono. Solo cuenta como teléfono una
 * corrida de 9 a 15 dígitos (con espacios, guiones o «+»): montos con punto o
 * coma y medidas como 205/55R16 no califican.
 */
export function trozosConTelefonos(linea: string): Trozo[] {
  const trozos: Trozo[] = [];
  const patron = /\+?\d[\d\s-]{7,18}\d/g;
  let desde = 0;
  for (const m of linea.matchAll(patron)) {
    const enlace = enlaceWhatsApp(m[0]);
    const inicio = m.index ?? 0;
    const antes = linea[inicio - 1] ?? "";
    const despues = linea[inicio + m[0].length] ?? "";
    // Pegado a «/», «.», «,» o una letra es parte de otra cosa (medida, monto, código).
    if (!enlace || /[\w/.,]/.test(antes) || /[\w/.,]/.test(despues)) continue;
    if (inicio > desde) trozos.push({ texto: linea.slice(desde, inicio) });
    trozos.push({ texto: m[0], whatsapp: enlace });
    desde = inicio + m[0].length;
  }
  if (desde < linea.length) trozos.push({ texto: linea.slice(desde) });
  return trozos;
}

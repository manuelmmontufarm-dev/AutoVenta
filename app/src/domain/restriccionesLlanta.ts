const normalizar = (texto: string) =>
  (texto ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const RECHAZA_POR_CALCE =
  /\b(?:muy\s+anch\w*|prefiero\s+(?:un\s+poco\s+)?mas\s+delgad\w*|prefiero\s+(?:un\s+poco\s+)?mas\s+angost\w*|roz\w*|no\s+(?:la\s+)?(?:quiero|deseo)|no\s+(?:me\s+)?(?:sirve|conviene|recomiend\w*)|evitar\s+(?:mayor\s+)?consumo)\b/;

const REHABILITA_ANCHO =
  /\b(?:si\s+(?:quiero|me\s+sirve)|esta\s+bien|deme|dame|quiero|prefiero|acepto|vamos\s+con|me\s+quedo\s+con)\b/;

export interface RestriccionesDeLlanta {
  anchosRechazados: number[];
}

export function restriccionesDeLlanta(textosCronologicos: readonly string[]): RestriccionesDeLlanta {
  const anchos = new Set<number>();
  for (const texto of textosCronologicos) {
    const n = normalizar(texto);
    const mencionados = [...n.matchAll(/\b(1[5-9]\d|2\d\d|3\d\d)(?:\s*\/|\b)/g)]
      .map((match) => Number(match[1]));
    if (RECHAZA_POR_CALCE.test(n)) {
      for (const ancho of mencionados) anchos.add(ancho);
    } else if (REHABILITA_ANCHO.test(n)) {
      // La memoria no puede convertirse en una condena eterna: si más tarde
      // el cliente cambia de opinión de forma explícita, su última decisión
      // manda.
      for (const ancho of mencionados) anchos.delete(ancho);
    }
  }
  return { anchosRechazados: [...anchos] };
}

export function anchoDeMedida(etiqueta: string | null | undefined): number | null {
  const match = etiqueta?.match(/\b(1[5-9]\d|2\d\d|3\d\d)\s*\//);
  return match ? Number(match[1]) : null;
}

export function violaRestriccionesDeLlanta(
  etiqueta: string | null | undefined,
  restricciones: RestriccionesDeLlanta,
): boolean {
  const ancho = anchoDeMedida(etiqueta);
  return ancho != null && restricciones.anchosRechazados.includes(ancho);
}

export function hechosDeRestricciones(restricciones: RestriccionesDeLlanta): string | null {
  if (!restricciones.anchosRechazados.length) return null;
  return `RESTRICCIONES DEL CLIENTE (fuente determinística): rechazó anchos ${restricciones.anchosRechazados.join(", ")} por calce/roce/consumo. PROHIBIDO volver a mostrarlos, recomendarlos o cotizarlos.`;
}

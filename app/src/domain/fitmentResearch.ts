const SIZE_RE = /\b\d{3}\/\d{2}R\d{2}\b/gi;

export function extractTireSizesFromUnknown(value: unknown): string[] {
  const seen = new Set<string>();
  const walk = (node: unknown): void => {
    if (typeof node === "string") for (const match of node.match(SIZE_RE) ?? []) seen.add(match.toUpperCase());
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object") Object.values(node as Record<string, unknown>).forEach(walk);
  };
  walk(value);
  return [...seen].slice(0, 12);
}

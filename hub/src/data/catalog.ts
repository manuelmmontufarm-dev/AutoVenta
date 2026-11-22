import { nombreParaArchivo } from "./negocio";
import { authHeaders, getSesion, getStoredAdminKey, saveStoredAdminKey } from "./realSource";

export type CatalogAvailability = "available" | "check" | "out";

export interface CatalogProduct {
  id: string;
  code: string;
  name: string;
  brand: string;
  design: string;
  sizeLabel: string | null;
  listPrice: number;
  salePrice: number;
  discountPercent: number;
  availability: CatalogAvailability;
  stock: number;
  imageUrl: string | null;
  imageSource: string | null;
  loadSpeed: {
    code: string;
    loadIndex: number;
    speedSymbol: string;
    loadKg: number | null;
    speedKmh: number | null;
  } | null;
  warranty: {
    factory: string;
    roadHazard: string | null;
    roadHazardMonths: number | null;
  };
  updatedAt: string | null;
}

export interface CatalogSearchResponse {
  ok: true;
  query: string;
  products: CatalogProduct[];
  catalog: {
    items: number;
    lastSync: string | null;
    source: "contifico" | "sheets" | "archivo" | null;
    error: string | null;
    /** Con fuente «archivo»: qué Excel se subió y cuándo. */
    archivo?: { nombre: string; subidoEn: string; aros: number } | null;
  };
}

export interface QuoteSelection {
  product: CatalogProduct;
  quantity: number;
}

export async function searchCatalog(query: string): Promise<CatalogSearchResponse> {
  return requestJson<CatalogSearchResponse>(
    `/api/catalog/search?q=${encodeURIComponent(query)}&limit=60`,
  );
}

export async function getOptionsMessage(
  products: readonly CatalogProduct[],
  style: "customer" | "distributor",
  customerName: string,
): Promise<string> {
  const data = await requestJson<{ ok: true; message: string }>(
    "/api/catalog/options-message",
    {
      method: "POST",
      body: JSON.stringify({
        items: products.map(({ id }) => ({ id })),
        style,
        customerName,
      }),
    },
  );
  return data.message;
}

export async function getComparisonMessage(
  products: readonly CatalogProduct[],
): Promise<string> {
  const data = await requestJson<{ ok: true; message: string }>(
    "/api/catalog/compare-message",
    {
      method: "POST",
      body: JSON.stringify({
        items: products.map(({ id }) => ({ id })),
        style: "comparison",
      }),
    },
  );
  return data.message;
}

export async function getQuoteMessage(
  product: CatalogProduct,
  quantity: number,
  customerName: string,
): Promise<string> {
  const data = await requestJson<{ ok: true; message: string }>(
    "/api/catalog/quote-message",
    {
      method: "POST",
      body: JSON.stringify({
        item: { id: product.id, quantity },
        customerName,
      }),
    },
  );
  return data.message;
}

export async function downloadComparisonPdf(
  products: readonly CatalogProduct[],
): Promise<void> {
  await downloadArchivo("/api/catalog/compare-pdf", {
    items: products.map(({ id }) => ({ id })),
    style: "comparison",
  });
}

export async function downloadQuotePdf(
  product: CatalogProduct,
  quantity: number,
  customerName: string,
): Promise<void> {
  await downloadArchivo("/api/catalog/quote-pdf", {
    item: { id: product.id, quantity },
    customerName,
  });
}

// ── Piezas visuales ──────────────────────────────────────────────────────────
//
// Las dibuja el servidor, con el mismo renderizador que usa el bot para
// mandarlas por WhatsApp. El hub solo las descarga: un render, cero divergencia
// (el canvas propio que había aquí se quedó en el diseño viejo y en la demo del
// 14-ago salieron dos piezas distintas para lo mismo).

/** Máximo de opciones por pieza: el póster dibuja 3 tarjetas por marca. */
export const MAX_OPCIONES_IMAGEN = 24;

export async function downloadOptionsImage(
  products: readonly CatalogProduct[],
  medidaPedida?: string,
): Promise<void> {
  if (!products.length) throw new Error("No hay opciones visibles para exportar");
  if (products.length > MAX_OPCIONES_IMAGEN) {
    throw new Error(
      `Reduce los filtros a máximo ${MAX_OPCIONES_IMAGEN} opciones para crear la imagen`,
    );
  }
  await downloadArchivo("/api/catalog/options-image", {
    items: products.map(({ id }) => ({ id })),
    ...(medidaPedida ? { medidaPedida } : {}),
  });
}

export async function downloadComparisonImage(
  products: readonly CatalogProduct[],
): Promise<void> {
  if (products.length < 2 || products.length > 3) {
    throw new Error("Selecciona dos o tres llantas para comparar");
  }
  await downloadArchivo("/api/catalog/compare-image", {
    items: products.map(({ id }) => ({ id })),
    style: "comparison",
  });
}

export async function downloadQuoteImage(
  product: CatalogProduct,
  quantity: number,
  customerName: string,
): Promise<void> {
  await downloadArchivo("/api/catalog/quote-image", {
    item: { id: product.id, quantity },
    customerName,
  });
}

export function saveAdminKey(value: string): void {
  saveStoredAdminKey(value);
}

/** ¿Hay con qué autenticarse? Sesión de usuario o, en su defecto, clave cruda. */
export function hasAdminKey(): boolean {
  return Boolean(getSesion()) || getStoredAdminKey().length > 0;
}

/**
 * Descarga un archivo binario (PDF o PNG) que arma el servidor.
 *
 * El ancla va al DOM antes del click y se quita después: Safari ignora en
 * silencio el click de un ancla que no está en el documento, y el usuario se
 * quedaba mirando un botón que "no hacía nada". El revoke tardío es por lo
 * mismo — revocar en el acto le quita el blob a Safari antes de que lo lea.
 */
async function downloadArchivo(path: string, payload: unknown): Promise<void> {
  const response = await fetch(apiUrl(path), {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await responseError(response);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filenameFromDisposition(
    response.headers.get("Content-Disposition"),
  );
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 2_000);
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: { ...requestHeaders(), ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<T>;
}

function requestHeaders(): Record<string, string> {
  return { "Content-Type": "application/json", ...authHeaders() };
}

function apiUrl(path: string): string {
  const configured = String(
    import.meta.env.VITE_AUTOVENTA_API_BASE_URL ?? "",
  ).replace(/\/$/, "");
  return `${configured}${path}`;
}

async function responseError(response: Response): Promise<Error> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  const error = new Error(body.error || `Error HTTP ${response.status}`);
  error.name =
    response.status === 401 ? "AdminKeyRequired" : "CatalogRequestError";
  return error;
}

function filenameFromDisposition(value: string | null): string {
  const match = value?.match(/filename="?([^"]+)"?/i);
  return match?.[1] ?? `${nombreParaArchivo()}-${Date.now()}.pdf`;
}

// ── Teléfono: compartir en vez de descargar (22-nov-2026) ────────────────────
//
// En el teléfono «descargar un PDF» lo deja perdido en Archivos y hay que ir a
// buscarlo para mandarlo. Con la hoja de compartir del sistema el asesor elige
// WhatsApp y el PDF ya va adjunto. Donde no existe (escritorio), se descarga.

/** La cotización en PDF: se abre la hoja de compartir del teléfono; si no hay, se descarga. */
export async function shareQuotePdf(
  product: CatalogProduct,
  quantity: number,
  customerName: string,
): Promise<"compartido" | "descargado" | "cancelado"> {
  const response = await fetch(apiUrl("/api/catalog/quote-pdf"), {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify({ item: { id: product.id, quantity }, customerName }),
  });
  if (!response.ok) throw await responseError(response);
  const blob = await response.blob();
  const nombre = filenameFromDisposition(response.headers.get("Content-Disposition"));
  const archivo = new File([blob], nombre, { type: "application/pdf" });
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: nombre });
      return "compartido";
    } catch (error) {
      // Cerrar la hoja sin elegir no es un error.
      if ((error as Error).name === "AbortError") return "cancelado";
      throw error;
    }
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = nombre;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 2_000);
  return "descargado";
}

// ── Adjuntar desde el chat (el «+» del compositor) ───────────────────────────

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(apiUrl(path), { method: "POST", headers: requestHeaders(), body: JSON.stringify(payload) });
  if (!response.ok) throw await responseError(response);
  return (await response.json()) as T;
}

/** Manda la cotización en PDF al cliente de ese ticket, por WhatsApp. */
export function sendQuoteToChat(ticketId: number, product: CatalogProduct, quantity: number): Promise<{ ok: true; numero: string; total: number }> {
  return postJson(`/api/conversations/${ticketId}/send-quote`, { item: { id: product.id, quantity } });
}

/** La foto como JPEG, achicada para que no pese: `lado` es el máximo del lado largo. */
async function fotoAJpeg(archivo: Blob, lado: number, calidad: number): Promise<string> {
  const bitmap = await createImageBitmap(archivo);
  const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo leer la foto");
  // Fondo blanco: un PNG con transparencia saldría negro en JPEG.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", calidad);
}

/** Manda una foto (cámara o carrete) al cliente de ese ticket. */
export async function sendImageToChat(ticketId: number, archivo: Blob, caption = ""): Promise<void> {
  const [imagen, miniatura] = await Promise.all([fotoAJpeg(archivo, 1600, 0.85), fotoAJpeg(archivo, 360, 0.55)]);
  // Tipo propio (no `application/json`): el servidor lo lee con un tope de 6 MB;
  // como JSON normal lo cortaría en 100 kB (HTTP 413).
  const response = await fetch(apiUrl(`/api/conversations/${ticketId}/send-image`), {
    method: "POST",
    headers: { ...requestHeaders(), "Content-Type": "application/vnd.autoventa.foto+json" },
    body: JSON.stringify({ imagen, miniatura, caption }),
  });
  if (!response.ok) throw await responseError(response);
}

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
    source: "contifico" | "sheets" | null;
    error: string | null;
  };
}

export interface QuoteSelection {
  product: CatalogProduct;
  quantity: number;
}

const ADMIN_KEY_STORAGE = "autoventa_admin_key";

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
  await downloadPdf("/api/catalog/compare-pdf", {
    items: products.map(({ id }) => ({ id })),
    style: "comparison",
  });
}

export async function downloadQuotePdf(
  product: CatalogProduct,
  quantity: number,
  customerName: string,
): Promise<void> {
  await downloadPdf("/api/catalog/quote-pdf", {
    item: { id: product.id, quantity },
    customerName,
  });
}

export function saveAdminKey(value: string): void {
  const key = value.trim();
  if (key) localStorage.setItem(ADMIN_KEY_STORAGE, key);
  else localStorage.removeItem(ADMIN_KEY_STORAGE);
}

export function hasAdminKey(): boolean {
  return Boolean(localStorage.getItem(ADMIN_KEY_STORAGE));
}

async function downloadPdf(path: string, payload: unknown): Promise<void> {
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
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 2_000);
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
  const key = localStorage.getItem(ADMIN_KEY_STORAGE);
  return {
    "Content-Type": "application/json",
    ...(key ? { "x-admin-key": key } : {}),
  };
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
  return match?.[1] ?? `DepotTire-${Date.now()}.pdf`;
}

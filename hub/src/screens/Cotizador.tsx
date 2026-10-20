import { AnimatePresence, motion } from "framer-motion";
import { MedidaChip } from "../components/ui";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  downloadComparisonImage,
  downloadComparisonPdf,
  downloadOptionsImage,
  downloadQuoteImage,
  downloadQuotePdf,
  getComparisonMessage,
  getOptionsMessage,
  getQuoteMessage,
  hasAdminKey,
  saveAdminKey,
  searchCatalog,
  type CatalogAvailability,
  type CatalogProduct,
} from "../data/catalog";
import {
  IconCandado,
  IconCheck,
  IconComparar,
  IconDoc,
  IconImagen,
  IconRefresh,
  IconSearch,
  IconTire,
  IconX,
} from "../components/icons";

type Sort = "brand" | "price-asc" | "price-desc";
type PanelMode = "options" | "compare" | "quote";
type Action =
  | "options-customer"
  | "options-distributor"
  | "options-image"
  | "compare-message"
  | "compare-image"
  | "compare-pdf"
  | "quote-message"
  | "quote-image"
  | "quote-pdf"
  | null;

const QUICK_SEARCHES = [
  "175/70R13",
  "185/65R15",
  "195/55R15",
  "205/55R16",
  "215/75R15",
  "225/65R17",
  "265/70R16",
  "31X10.50R15",
];

const ALL_AVAILABILITY: CatalogAvailability[] = ["available", "check", "out"];

export function Cotizador() {
  const [query, setQuery] = useState("205/55R16");
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [catalogMeta, setCatalogMeta] = useState<{
    items: number;
    lastSync: string | null;
    source: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedAvailability, setSelectedAvailability] =
    useState<CatalogAvailability[]>(ALL_AVAILABILITY);
  const [sort, setSort] = useState<Sort>("brand");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [quoteProductId, setQuoteProductId] = useState<string | null>(null);
  const [quoteQuantity, setQuoteQuantity] = useState(4);
  const [customerName, setCustomerName] = useState("Cliente");
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<CatalogProduct | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>("options");
  const [action, setAction] = useState<Action>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void runSearch("205/55R16");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const brands = useMemo(
    () =>
      [...new Set(products.map((product) => product.brand))].sort((a, b) =>
        a.localeCompare(b, "es"),
      ),
    [products],
  );

  const visibleProducts = useMemo(() => {
    const filtered = products.filter(
      (product) =>
        selectedBrands.includes(product.brand) &&
        selectedAvailability.includes(product.availability),
    );
    return [...filtered].sort((a, b) => {
      if (sort === "price-asc") return a.salePrice - b.salePrice;
      if (sort === "price-desc") return b.salePrice - a.salePrice;
      return (
        a.brand.localeCompare(b.brand, "es") ||
        a.salePrice - b.salePrice
      );
    });
  }, [products, selectedBrands, selectedAvailability, sort]);

  const compareProducts = useMemo(
    () =>
      compareIds
        .map((id) => products.find((product) => product.id === id))
        .filter((product): product is CatalogProduct => Boolean(product)),
    [compareIds, products],
  );
  const quoteProduct =
    products.find((product) => product.id === quoteProductId) ?? null;

  useEffect(() => {
    const visibleIds = new Set(visibleProducts.map(({ id }) => id));
    setCompareIds((current) => current.filter((id) => visibleIds.has(id)));
  }, [visibleProducts]);

  async function runSearch(nextQuery = query) {
    const clean = nextQuery.trim();
    if (!clean) return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const result = await searchCatalog(clean);
      const nextBrands = [
        ...new Set(result.products.map((product) => product.brand)),
      ].sort((a, b) => a.localeCompare(b, "es"));
      setProducts(result.products);
      setCatalogMeta(result.catalog);
      setSelectedBrands(nextBrands);
      setSelectedAvailability(ALL_AVAILABILITY);
      setCompareIds([]);
      setQuoteProductId(null);
      setPanelMode("options");
    } catch (cause) {
      const err = cause as Error;
      setProducts([]);
      setError(
        err.name === "AdminKeyRequired"
          ? "El catálogo está protegido. Ingresa la clave de administración."
          : err.message,
      );
    } finally {
      setLoading(false);
    }
  }

  function toggleBrand(value: string) {
    setSelectedBrands((current) =>
      current.includes(value)
        ? current.filter((brand) => brand !== value)
        : [...current, value],
    );
    setPanelMode("options");
  }

  function toggleAvailability(value: CatalogAvailability) {
    setSelectedAvailability((current) =>
      current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value],
    );
    setPanelMode("options");
  }

  function toggleComparison(product: CatalogProduct) {
    setNotice("");
    setCompareIds((current) => {
      if (current.includes(product.id)) {
        return current.filter((id) => id !== product.id);
      }
      if (current.length >= 3) {
        setNotice("La comparativa admite máximo tres modelos.");
        return current;
      }
      return [...current, product.id];
    });
    setPanelMode("compare");
  }

  function chooseQuote(product: CatalogProduct) {
    setQuoteProductId(product.id);
    setQuoteQuantity(4);
    setPanelMode("quote");
    setNotice("");
  }

  async function copyOptions(style: "customer" | "distributor") {
    if (!visibleProducts.length) return;
    const nextAction =
      style === "customer" ? "options-customer" : "options-distributor";
    await perform(nextAction, async () => {
      const message = await getOptionsMessage(
        visibleProducts,
        style,
        customerName.trim() || "Cliente",
      );
      await navigator.clipboard.writeText(message);
      setNotice(
        style === "customer"
          ? "Mensaje para cliente final copiado."
          : "Mensaje para distribuidor copiado.",
      );
    });
  }

  async function createOptionsImage() {
    await perform("options-image", async () => {
      // La medida buscada viaja con la petición: es la que el servidor usa para
      // sellar cada tarjeta como MEDIDA EXACTA o como equivalente, igual que
      // cuando la pieza sale por WhatsApp.
      await downloadOptionsImage(visibleProducts, query.trim());
      setNotice("Imagen de opciones filtradas descargada.");
    });
  }

  async function copyComparison() {
    await perform("compare-message", async () => {
      const message = await getComparisonMessage(compareProducts);
      await navigator.clipboard.writeText(message);
      setNotice("Comparativa copiada.");
    });
  }

  async function createComparisonImage() {
    await perform("compare-image", async () => {
      await downloadComparisonImage(compareProducts);
      setNotice("Imagen comparativa descargada.");
    });
  }

  async function createComparisonPdf() {
    await perform("compare-pdf", async () => {
      await downloadComparisonPdf(compareProducts);
      setNotice("PDF comparativo descargado.");
    });
  }

  async function copyQuote() {
    if (!quoteProduct) return;
    await perform("quote-message", async () => {
      const message = await getQuoteMessage(
        quoteProduct,
        quoteQuantity,
        customerName.trim() || "Cliente",
      );
      await navigator.clipboard.writeText(message);
      setNotice("Cotización para WhatsApp copiada.");
    });
  }

  async function createQuoteImage() {
    if (!quoteProduct) return;
    await perform("quote-image", async () => {
      await downloadQuoteImage(
        quoteProduct,
        quoteQuantity,
        customerName.trim() || "Cliente",
      );
      setNotice("Imagen de cotización descargada.");
    });
  }

  async function createQuotePdf() {
    if (!quoteProduct) return;
    await perform("quote-pdf", async () => {
      await downloadQuotePdf(
        quoteProduct,
        quoteQuantity,
        customerName.trim() || "Cliente",
      );
      setNotice("PDF de cotización descargado.");
    });
  }

  async function perform(nextAction: Exclude<Action, null>, work: () => Promise<void>) {
    setAction(nextAction);
    setNotice("");
    try {
      await work();
    } catch (cause) {
      setNotice((cause as Error).message);
    } finally {
      setAction(null);
    }
  }

  function configureAdminKey() {
    const value = window.prompt(
      "Clave de administración del Hub",
      hasAdminKey() ? "••••••••" : "",
    );
    if (value === null) return;
    if (value !== "••••••••") saveAdminKey(value);
    void runSearch();
  }

  return (
    <div className="flex h-full min-h-0 flex-col px-4 pb-4 md:px-8 md:pb-8">
      <SearchBar
        query={query}
        setQuery={setQuery}
        loading={loading}
        runSearch={runSearch}
        catalogMeta={catalogMeta}
      />

      <div className="scrollbar-none flex gap-1.5 overflow-x-auto pb-3">
        {QUICK_SEARCHES.map((value) => (
          <button
            key={value}
            onClick={() => {
              setQuery(value);
              void runSearch(value);
            }}
            className="btn-quiet h-[30px] shrink-0 rounded-[6px] px-2.5 font-mono text-[12px] text-text2"
          >
            {value.replace(/R(\d)/, " R$1")}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[210px_minmax(0,1fr)_330px]">
        <aside className="hidden min-h-0 overflow-y-auto rounded-[10px] border border-line bg-surface p-4 lg:block">
          <FilterPanel
            products={products}
            brands={brands}
            selectedBrands={selectedBrands}
            setSelectedBrands={setSelectedBrands}
            toggleBrand={toggleBrand}
            selectedAvailability={selectedAvailability}
            setSelectedAvailability={setSelectedAvailability}
            toggleAvailability={toggleAvailability}
            sort={sort}
            setSort={setSort}
          />
        </aside>

        <main className="min-h-0 overflow-y-auto">
          {error ? (
            <ConnectionError
              message={error}
              onConfigure={configureAdminKey}
              onRetry={() => void runSearch()}
            />
          ) : loading ? (
            <ProductSkeletons />
          ) : visibleProducts.length === 0 ? (
            <EmptyFilters
              reset={() => {
                setSelectedBrands(brands);
                setSelectedAvailability(ALL_AVAILABILITY);
              }}
            />
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-[13px]">
                  <strong className="font-semibold">{visibleProducts.length}</strong>{" "}
                  opciones visibles para{" "}
                  <span className="font-mono">{query}</span>
                </p>
                <p className="hidden text-[12px] text-text2 sm:block">
                  Los mensajes usan exactamente estos filtros
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                <AnimatePresence mode="popLayout">
                  {visibleProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      selected={compareIds.includes(product.id)}
                      imageBroken={brokenImages.has(product.id)}
                      onImageError={() =>
                        setBrokenImages((current) =>
                          new Set(current).add(product.id),
                        )
                      }
                      onPreview={() => setPreview(product)}
                      onToggle={() => toggleComparison(product)}
                      onQuote={() => chooseQuote(product)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </>
          )}
        </main>

        <aside className="hidden min-h-0 overflow-y-auto rounded-[10px] border border-line bg-surface p-4 lg:block">
          <ActionPanel
            mode={panelMode}
            setMode={setPanelMode}
            visibleProducts={visibleProducts}
            compareProducts={compareProducts}
            quoteProduct={quoteProduct}
            quoteQuantity={quoteQuantity}
            setQuoteQuantity={setQuoteQuantity}
            customerName={customerName}
            setCustomerName={setCustomerName}
            removeComparison={(id) =>
              setCompareIds((current) => current.filter((entry) => entry !== id))
            }
            action={action}
            notice={notice}
            copyOptions={copyOptions}
            createOptionsImage={createOptionsImage}
            copyComparison={copyComparison}
            createComparisonImage={createComparisonImage}
            createComparisonPdf={createComparisonPdf}
            copyQuote={copyQuote}
            createQuoteImage={createQuoteImage}
            createQuotePdf={createQuotePdf}
          />
        </aside>
      </div>

      <div className="fixed inset-x-4 bottom-[84px] z-30 flex items-center gap-2 rounded-[8px] border border-line bg-surface p-2 shadow-pop lg:hidden">
        <button
          onClick={() => void copyOptions("customer")}
          className="btn-quiet h-10 flex-1 rounded-[6px] px-2 text-[12px]"
        >
          <span className="inline-flex items-center justify-center gap-1"><IconDoc size={12} /> {visibleProducts.length} opciones</span>
        </button>
        <button
          onClick={() => void createComparisonPdf()}
          disabled={compareProducts.length < 2}
          className="btn-quiet h-10 flex-1 rounded-[6px] px-2 text-[12px]"
        >
          <span className="inline-flex items-center justify-center gap-1"><IconComparar size={12} /> Comparar {compareProducts.length}/3</span>
        </button>
        <button
          onClick={() => void createQuotePdf()}
          disabled={!quoteProduct}
          className="btn-signal h-10 flex-1 rounded-[6px] px-2 text-[12px]"
        >
          Cotizar
        </button>
      </div>

      <PhotoModal product={preview} close={() => setPreview(null)} />
    </div>
  );
}

function SearchBar({
  query,
  setQuery,
  loading,
  runSearch,
  catalogMeta,
}: {
  query: string;
  setQuery: (value: string) => void;
  loading: boolean;
  runSearch: (value?: string) => Promise<void>;
  catalogMeta: { items: number; source: string | null } | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 pb-3">
      <form
        className="flex h-11 min-w-60 flex-1 items-center gap-2 rounded-[6px] border border-text bg-surface pr-1 pl-3 sm:max-w-[560px]"
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch();
        }}
      >
        <IconSearch size={17} className="shrink-0 text-text2" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Medida, código, marca o diseño…"
          className="min-w-0 flex-1 bg-transparent font-mono text-[14px] outline-none"
        />
        <button
          type="submit"
          disabled={loading}
          className="btn-signal h-[34px] rounded-[4px] px-3.5 text-[13px]"
        >
          Buscar
        </button>
      </form>
      <button
        onClick={() => void runSearch()}
        className="btn-quiet grid h-11 w-11 place-items-center rounded-[6px] text-text2"
        title="Actualizar búsqueda"
      >
        <IconRefresh size={17} className={loading ? "animate-spin" : ""} />
      </button>
      {catalogMeta && (
        <span className="hidden items-center gap-2 text-[12px] text-text2 md:flex">
          <span className="pulse-dot" />
          <span className="font-mono">{catalogMeta.items}</span> llantas · {catalogMeta.source ?? "catálogo"}
        </span>
      )}
    </div>
  );
}

function ProductCard({
  product,
  selected,
  imageBroken,
  onImageError,
  onPreview,
  onToggle,
  onQuote,
}: {
  product: CatalogProduct;
  selected: boolean;
  imageBroken: boolean;
  onImageError: () => void;
  onPreview: () => void;
  onToggle: () => void;
  onQuote: () => void;
}) {
  const disabled = product.availability === "out";
  return (
    <motion.article
      layout
      className="flex flex-col overflow-hidden rounded-[8px] border bg-surface"
      style={{
        borderColor: selected ? "var(--color-signal)" : "var(--color-line)",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <button
        onClick={onPreview}
        className="relative block aspect-[16/10] w-full overflow-hidden border-b border-line bg-bg"
        aria-label={`Ver foto de ${product.design}`}
      >
        {product.imageUrl && !imageBroken ? (
          <img
            src={product.imageUrl}
            alt={product.design}
            className="h-full w-full object-contain p-3"
            loading="lazy"
            onError={onImageError}
          />
        ) : (
          <PremiumPlaceholder brand={product.brand} />
        )}
        <span className="absolute top-2.5 left-3 text-[12px] font-semibold">{product.brand}</span>
        <AvailabilityBadge value={product.availability} />
        <span className="tnum absolute right-3 bottom-2.5 font-mono text-[11px] text-text2">
          {Math.max(0, product.stock).toLocaleString("es-EC")} en inventario
        </span>
      </button>
      <div className="flex flex-1 flex-col gap-1 px-4 pt-3.5 pb-4">
        <p className="truncate text-[15px] font-semibold">
          {product.design}
        </p>
        <div>{product.sizeLabel ? <MedidaChip medida={product.sizeLabel} /> : <span className="text-[13px] text-text2">{product.name}</span>}</div>
        {product.loadSpeed && (
          <p className="font-mono text-[12px] text-text2">{specLabel(product)}</p>
        )}
        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <p className="text-[12px] text-text2">Precio hoy</p>
            <p className="tnum font-mono text-[22px] leading-[1.1] font-bold">
              {money(product.salePrice)}
            </p>
            <p className="tnum font-mono text-[11px] text-text2">
              <s>{money(product.listPrice)}</s>{" · "}
              <b className="font-semibold text-ok">
                −{product.discountPercent} %
              </b>
            </p>
          </div>
          <button
            onClick={onToggle}
            disabled={disabled}
            className={`grid h-10 w-10 place-items-center rounded-[6px] border transition-colors ${
              selected
                ? "border-signal bg-signal-tint text-signal"
                : "border-line bg-surface text-text hover:bg-bg"
            } disabled:cursor-not-allowed disabled:opacity-40`}
            aria-label={
              selected ? "Quitar de comparación" : "Agregar a comparación"
            }
            title="Comparar modelo"
          >
            {selected ? <IconCheck size={18} /> : <IconComparar size={16} />}
          </button>
        </div>
        <div className="mt-3 border-t border-line pt-2.5 text-[12px] leading-relaxed text-text2">
          <p>{product.warranty.factory}</p>
          {product.warranty.roadHazard && <p>{product.warranty.roadHazard}</p>}
        </div>
        <button
          onClick={onQuote}
          disabled={disabled}
          className="mt-2.5 h-[38px] w-full rounded-[6px] border border-text bg-surface text-[13px] font-semibold transition-colors hover:bg-bg disabled:opacity-40"
        >
          Cotizar esta llanta
        </button>
      </div>
    </motion.article>
  );
}

function FilterPanel({
  products,
  brands,
  selectedBrands,
  setSelectedBrands,
  toggleBrand,
  selectedAvailability,
  setSelectedAvailability,
  toggleAvailability,
  sort,
  setSort,
}: {
  products: CatalogProduct[];
  brands: string[];
  selectedBrands: string[];
  setSelectedBrands: (value: string[]) => void;
  toggleBrand: (value: string) => void;
  selectedAvailability: CatalogAvailability[];
  setSelectedAvailability: (value: CatalogAvailability[]) => void;
  toggleAvailability: (value: CatalogAvailability) => void;
  sort: Sort;
  setSort: (value: Sort) => void;
}) {
  const count = (value: CatalogAvailability) =>
    products.filter((product) => product.availability === value).length;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between px-1">
        <p className="text-[13px] font-semibold">Marcas visibles</p>
        <span className="tnum font-mono text-[12px] text-text2">
          {selectedBrands.length}/{brands.length}
        </span>
      </div>
      <CheckFilter
        label="Seleccionar todo"
        count={products.length}
        checked={selectedBrands.length === brands.length}
        onClick={() =>
          setSelectedBrands(
            selectedBrands.length === brands.length ? [] : brands,
          )
        }
      />
      {brands.map((value) => (
        <CheckFilter
          key={value}
          label={value}
          count={products.filter((product) => product.brand === value).length}
          checked={selectedBrands.includes(value)}
          onClick={() => toggleBrand(value)}
        />
      ))}

      <p className="mt-[18px] mb-1.5 px-1 text-[13px] font-semibold">Disponibilidad</p>
      <CheckFilter
        label="Todo"
        count={products.length}
        checked={selectedAvailability.length === ALL_AVAILABILITY.length}
        onClick={() =>
          setSelectedAvailability(
            selectedAvailability.length === ALL_AVAILABILITY.length
              ? []
              : ALL_AVAILABILITY,
          )
        }
      />
      <CheckFilter
        label="Disponible"
        count={count("available")}
        checked={selectedAvailability.includes("available")}
        onClick={() => toggleAvailability("available")}
      />
      <CheckFilter
        label="Consultar"
        count={count("check")}
        checked={selectedAvailability.includes("check")}
        onClick={() => toggleAvailability("check")}
      />
      <CheckFilter
        label="Agotada"
        count={count("out")}
        checked={selectedAvailability.includes("out")}
        onClick={() => toggleAvailability("out")}
      />

      <p className="mt-[18px] mb-2 px-1 text-[13px] font-semibold">Orden</p>
      <select
        value={sort}
        onChange={(event) => setSort(event.target.value as Sort)}
        className="gp-field h-9 py-0 text-[13px]"
      >
        <option value="brand">Por marca</option>
        <option value="price-asc">Menor precio hoy</option>
        <option value="price-desc">Mayor precio hoy</option>
      </select>

      <p className="mt-[18px] text-[12px] leading-relaxed text-text2">
        El mensaje para el cliente y la imagen incluyen sólo las opciones que
        dejan activas estos filtros.
      </p>
    </div>
  );
}

function CheckFilter({
  label,
  count,
  checked,
  onClick,
}: {
  label: string;
  count: number;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      role="checkbox"
      aria-checked={checked}
      className={`flex h-[34px] w-full items-center gap-2 rounded-[6px] px-2 text-left text-[13px] transition-colors hover:bg-black/[.04] ${checked ? "text-text" : "text-text2"}`}
    >
      <span
        className={`grid h-4 w-4 place-items-center rounded-[4px] border ${checked ? "border-text bg-text text-white" : "border-line-strong bg-surface text-transparent"}`}
      >
        {checked && <IconCheck size={11} strokeWidth={2.4} />}
      </span>
      <span className="flex-1">{label}</span>
      <span className="tnum font-mono text-[12px] text-text2">{count}</span>
    </button>
  );
}

function ActionPanel({
  mode,
  setMode,
  visibleProducts,
  compareProducts,
  quoteProduct,
  quoteQuantity,
  setQuoteQuantity,
  customerName,
  setCustomerName,
  removeComparison,
  action,
  notice,
  copyOptions,
  createOptionsImage,
  copyComparison,
  createComparisonImage,
  createComparisonPdf,
  copyQuote,
  createQuoteImage,
  createQuotePdf,
}: {
  mode: PanelMode;
  setMode: (mode: PanelMode) => void;
  visibleProducts: CatalogProduct[];
  compareProducts: CatalogProduct[];
  quoteProduct: CatalogProduct | null;
  quoteQuantity: number;
  setQuoteQuantity: (value: number) => void;
  customerName: string;
  setCustomerName: (value: string) => void;
  removeComparison: (id: string) => void;
  action: Action;
  notice: string;
  copyOptions: (style: "customer" | "distributor") => Promise<void>;
  createOptionsImage: () => Promise<void>;
  copyComparison: () => Promise<void>;
  createComparisonImage: () => Promise<void>;
  createComparisonPdf: () => Promise<void>;
  copyQuote: () => Promise<void>;
  createQuoteImage: () => Promise<void>;
  createQuotePdf: () => Promise<void>;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <div className="grid grid-cols-3 rounded-[6px] border border-line bg-bg p-0.5">
        <PanelTab
          label={`Opciones ${visibleProducts.length}`}
          active={mode === "options"}
          onClick={() => setMode("options")}
        />
        <PanelTab
          label={`Comparar ${compareProducts.length}/3`}
          active={mode === "compare"}
          onClick={() => setMode("compare")}
        />
        <PanelTab
          label="Cotizar"
          active={mode === "quote"}
          onClick={() => setMode("quote")}
        />
      </div>

      {mode === "options" && (
        <OptionsPanel
          products={visibleProducts}
          customerName={customerName}
          setCustomerName={setCustomerName}
          action={action}
          copyOptions={copyOptions}
          createImage={createOptionsImage}
        />
      )}
      {mode === "compare" && (
        <ComparePanel
          products={compareProducts}
          remove={removeComparison}
          action={action}
          copyMessage={copyComparison}
          createImage={createComparisonImage}
          createPdf={createComparisonPdf}
        />
      )}
      {mode === "quote" && (
        <QuotePanel
          product={quoteProduct}
          quantity={quoteQuantity}
          setQuantity={setQuoteQuantity}
          customerName={customerName}
          setCustomerName={setCustomerName}
          action={action}
          copyMessage={copyQuote}
          createImage={createQuoteImage}
          createPdf={createQuotePdf}
        />
      )}
      {notice && (
        <p className="mt-3 text-center text-[12px] text-text2">
          {notice}
        </p>
      )}
    </div>
  );
}

function OptionsPanel({
  products,
  customerName,
  setCustomerName,
  action,
  copyOptions,
  createImage,
}: {
  products: CatalogProduct[];
  customerName: string;
  setCustomerName: (value: string) => void;
  action: Action;
  copyOptions: (style: "customer" | "distributor") => Promise<void>;
  createImage: () => Promise<void>;
}) {
  return (
    <div className="flex flex-1 flex-col pt-4">
      <p className="text-[13px] font-semibold">Opciones filtradas</p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-text2">
        Estas acciones usan las {products.length} llantas visibles en el centro,
        agrupadas por marca. No dependen de la comparativa.
      </p>
      <label className="mt-4 text-[12px] text-text2" htmlFor="cliente-opciones">Cliente</label>
      <input
        id="cliente-opciones"
        value={customerName}
        onChange={(event) => setCustomerName(event.target.value)}
        className="gp-field mt-1.5 text-[13px]"
        placeholder="Nombre opcional"
      />
      <div className="mt-auto pt-5">
        <ActionButton
          onClick={() => void copyOptions("distributor")}
          loading={action === "options-distributor"}
          disabled={Boolean(action) || !products.length}
          label="Copiar mensaje distribuidor"
          icon={<IconDoc size={14} />}
        />
        <ActionButton
          onClick={() => void copyOptions("customer")}
          loading={action === "options-customer"}
          disabled={Boolean(action) || !products.length}
          label="Copiar mensaje cliente final"
          icon={<IconDoc size={14} />}
          primary
        />
        <ActionButton
          onClick={() => void createImage()}
          loading={action === "options-image"}
          disabled={Boolean(action) || !products.length}
          label="Guardar imagen para WhatsApp"
          icon={<IconImagen size={14} />}
          success
        />
      </div>
    </div>
  );
}

function ComparePanel({
  products,
  remove,
  action,
  copyMessage,
  createImage,
  createPdf,
}: {
  products: CatalogProduct[];
  remove: (id: string) => void;
  action: Action;
  copyMessage: () => Promise<void>;
  createImage: () => Promise<void>;
  createPdf: () => Promise<void>;
}) {
  const ready = products.length >= 2;
  return (
    <div className="flex flex-1 flex-col pt-4">
      <p className="text-[13px] font-semibold">Comparar alternativas</p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-text2">
        Elegí 2 o 3 modelos. Se comparan por unidad; aquí nunca se suman como una
        compra.
      </p>
      <div className="mt-3.5 flex flex-col gap-2">
        {products.map((product) => (
          <div
            key={product.id}
            className="flex items-center gap-2.5 rounded-[8px] border border-line p-2.5"
          >
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                className="h-12 w-12 rounded-[6px] border border-line bg-bg object-contain"
                alt=""
              />
            ) : (
              <span className="grid h-12 w-12 place-items-center rounded-[6px] border border-line bg-bg text-text2"><IconTire size={24} /></span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold">
                {product.brand} {product.design}
              </p>
              <p className="tnum mt-0.5 font-mono text-[12px] text-text2">
                {money(product.salePrice)} c/u
              </p>
            </div>
            <button
              onClick={() => remove(product.id)}
              className="grid h-7 w-7 place-items-center text-text2 hover:text-text"
              aria-label="Quitar de la comparación"
            >
              <IconX size={14} />
            </button>
          </div>
        ))}
      </div>
      {!ready && (
        <p className="mt-3.5 text-[12px] text-text2">
          Elegí al menos dos modelos con el botón Comparar de cada tarjeta.
        </p>
      )}
      <div className="mt-auto pt-5">
        <ActionButton
          onClick={() => void copyMessage()}
          loading={action === "compare-message"}
          disabled={Boolean(action) || !ready}
          label="Copiar comparativa"
          icon={<IconDoc size={14} />}
        />
        <ActionButton
          onClick={() => void createImage()}
          loading={action === "compare-image"}
          disabled={Boolean(action) || !ready}
          label="Imagen comparativa"
          icon={<IconImagen size={14} />}
        />
        <ActionButton
          onClick={() => void createPdf()}
          loading={action === "compare-pdf"}
          disabled={Boolean(action) || !ready}
          label="Descargar PDF comparativo"
          primary
          icon={<IconDoc size={15} />}
        />
      </div>
    </div>
  );
}

function QuotePanel({
  product,
  quantity,
  setQuantity,
  customerName,
  setCustomerName,
  action,
  copyMessage,
  createImage,
  createPdf,
}: {
  product: CatalogProduct | null;
  quantity: number;
  setQuantity: (value: number) => void;
  customerName: string;
  setCustomerName: (value: string) => void;
  action: Action;
  copyMessage: () => Promise<void>;
  createImage: () => Promise<void>;
  createPdf: () => Promise<void>;
}) {
  if (!product) {
    return (
      <div className="grid flex-1 place-items-center py-12 text-center">
        <div>
          <IconTire size={24} className="mx-auto text-text3" />
          <p className="mt-3 text-[15px] font-semibold">Elegí una llanta</p>
          <p className="mt-1 text-[13px] text-text2">
            Tocá «Cotizar esta llanta» en el modelo decidido.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col pt-4">
      <p className="text-[13px] font-semibold">Cotización final</p>
      <div className="mt-3 flex items-center gap-3 rounded-[8px] border border-line p-2.5">
        {product.imageUrl && (
          <img
            src={product.imageUrl}
            alt=""
            className="h-14 w-14 rounded-[6px] border border-line bg-bg object-contain"
          />
        )}
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">
            {product.brand} {product.design}
          </p>
          {product.sizeLabel && <div className="mt-1"><MedidaChip medida={product.sizeLabel} size="sm" /></div>}
          <p className="tnum mt-1 font-mono text-[12px] text-text2">
            {money(product.salePrice)} c/u
          </p>
        </div>
      </div>
      <label className="mt-4 text-[12px] text-text2" htmlFor="cliente-cotizacion">Cliente</label>
      <input
        id="cliente-cotizacion"
        value={customerName}
        onChange={(event) => setCustomerName(event.target.value)}
        className="gp-field mt-1.5 text-[13px]"
        placeholder="Nombre del cliente"
      />
      <div className="mt-4 flex items-end justify-between gap-3">
        <label className="text-[12px] text-text2">
          Cantidad
          <input
            type="number"
            min={1}
            max={8}
            value={quantity}
            onChange={(event) =>
              setQuantity(
                Math.max(1, Math.min(8, Number(event.target.value) || 1)),
              )
            }
            className="gp-field tnum mt-1.5 block w-20 text-center font-mono text-[14px]"
          />
        </label>
        <div className="text-right">
          <p className="text-[12px] text-text2">Total con IVA</p>
          <p className="tnum mt-0.5 font-mono text-[22px] font-bold">
            {money(product.salePrice * quantity)}
          </p>
        </div>
      </div>
      <div className="mt-auto pt-5">
        <ActionButton
          onClick={() => void copyMessage()}
          loading={action === "quote-message"}
          disabled={Boolean(action)}
          label="Copiar cotización"
          icon={<IconDoc size={14} />}
        />
        <ActionButton
          onClick={() => void createImage()}
          loading={action === "quote-image"}
          disabled={Boolean(action)}
          label="Imagen de cotización"
          icon={<IconImagen size={14} />}
        />
        <ActionButton
          onClick={() => void createPdf()}
          loading={action === "quote-pdf"}
          disabled={Boolean(action)}
          label="Descargar PDF de cotización"
          primary
          icon={<IconDoc size={15} />}
        />
      </div>
    </div>
  );
}

function PanelTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`flex h-8 items-center justify-center rounded-[4px] px-1 text-[12px] whitespace-nowrap transition-colors ${
        active ? "bg-surface font-semibold text-signal shadow-[0_1px_2px_rgba(28,27,25,.08)]" : "font-medium text-text2 hover:text-text"
      }`}
    >
      {label}
    </button>
  );
}

function ActionButton({
  onClick,
  loading,
  disabled,
  label,
  primary,
  success,
  icon,
}: {
  onClick: () => void;
  loading: boolean;
  disabled: boolean;
  label: string;
  primary?: boolean;
  success?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`mb-2 flex h-10 w-full items-center justify-center gap-2 rounded-[6px] px-3 text-[13px] ${
        primary ? "btn-signal" : success ? "btn-quiet" : "btn-quiet"
      }`}
    >
      {icon}
      {loading ? "Preparando…" : label}
    </button>
  );
}

function PhotoModal({
  product,
  close,
}: {
  product: CatalogProduct | null;
  close: () => void;
}) {
  return (
    <AnimatePresence>
      {product && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center p-4"
          style={{ background: "var(--color-scrim)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
        >
          <motion.div
            className="relative w-full max-w-xl rounded-[10px] border border-line bg-surface p-5 text-text shadow-pop"
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 4, opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              onClick={close}
              className="btn-quiet absolute top-4 right-4 z-10 grid h-9 w-9 place-items-center rounded-[6px]"
              aria-label="Cerrar"
            >
              <IconX size={18} />
            </button>
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.design}
                className="mx-auto h-[52vh] max-h-[560px] w-full object-contain"
              />
            ) : (
              <PremiumPlaceholder brand={product.brand} />
            )}
            <div className="mt-3 text-center">
              <p className="text-[18px] font-semibold">{product.design}</p>
              <p className="mt-1 text-[13px] text-text2">
                {product.brand} · {product.sizeLabel}
              </p>
              {product.imageUrl && (
                <a
                  href={product.imageUrl}
                  download={`${product.brand}-${product.design}.jpg`}
                  className="btn-signal mt-4 inline-flex h-10 items-center rounded-[6px] px-5 text-[13px]"
                >
                  Descargar foto limpia
                </a>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PremiumPlaceholder({ brand }: { brand: string }) {
  return (
    <div className="grid h-full min-h-40 place-items-center bg-bg">
      <div className="text-center">
        <IconTire size={40} className="mx-auto text-text3" />
        <p className="mt-2 text-[12px] text-text2">
          {brand} · imagen en validación
        </p>
      </div>
    </div>
  );
}

function AvailabilityBadge({ value }: { value: CatalogAvailability }) {
  const meta = {
    available: { label: "Disponible", color: "var(--color-ok)", peso: 600 },
    check: { label: "Por confirmar", color: "var(--color-warn)", peso: 500 },
    out: { label: "Agotada", color: "var(--color-text2)", peso: 500 },
  }[value];
  return (
    <span className="absolute top-2.5 right-3 text-[12px]" style={{ color: meta.color, fontWeight: meta.peso }}>
      {meta.label}
    </span>
  );
}

function EmptyFilters({ reset }: { reset: () => void }) {
  return (
    <div className="grid min-h-72 place-items-center rounded-[10px] border border-line bg-surface p-8 text-center">
      <div>
        <IconTire size={24} className="mx-auto text-text3" />
        <p className="mt-3 text-[15px] font-semibold">
          No hay opciones con estos filtros
        </p>
        <button
          onClick={reset}
          className="btn-quiet mt-4 h-9 rounded-[6px] px-4 text-[13px]"
        >
          Activar todos
        </button>
      </div>
    </div>
  );
}

function ConnectionError({
  message,
  onConfigure,
  onRetry,
}: {
  message: string;
  onConfigure: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="grid min-h-80 place-items-center rounded-[10px] border border-line bg-surface p-8 text-center">
      <div className="max-w-sm">
        <IconCandado size={24} className="mx-auto text-text3" />
        <p className="mt-3 text-[15px] font-semibold">
          No pudimos abrir el catálogo
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-text2">{message}</p>
        <div className="mt-5 flex justify-center gap-2">
          <button
            onClick={onConfigure}
            className="btn-signal h-10 rounded-[6px] px-4 text-[13px]"
          >
            Ingresar clave
          </button>
          <button
            onClick={onRetry}
            className="btn-quiet h-10 rounded-[6px] px-4 text-[13px]"
          >
            Reintentar
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductSkeletons() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3" aria-busy="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-[8px] border border-line bg-surface"
          style={{ opacity: 1 - index * 0.08 }}
        >
          <div className="skeleton aspect-[16/10]" />
          <div className="p-4">
            <div className="skeleton h-4 w-2/3" />
            <div className="skeleton mt-3 h-3 w-1/2" />
            <div className="skeleton mt-5 h-6 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function specLabel(product: CatalogProduct): string {
  if (!product.loadSpeed) return "";
  const details = [
    product.loadSpeed.loadKg ? `${product.loadSpeed.loadKg} kg` : null,
    product.loadSpeed.speedKmh ? `${product.loadSpeed.speedKmh} km/h` : null,
  ].filter(Boolean);
  return details.length
    ? `${product.loadSpeed.code} · ${details.join(" · ")}`
    : product.loadSpeed.code;
}

function money(value: number): string {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}


import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  downloadComparisonPdf,
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
  IconCheck,
  IconDoc,
  IconRefresh,
  IconSearch,
  IconTire,
  IconX,
} from "../components/icons";
import {
  downloadComparisonImage,
  downloadOptionsImage,
  downloadQuoteImage,
} from "../lib/quoteImage";

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
      await downloadOptionsImage(visibleProducts);
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
        { product: quoteProduct, quantity: quoteQuantity },
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
    <div className="flex h-full min-h-0 flex-col px-4 pb-5">
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
            className="medida-chip shrink-0 rounded-lg px-2.5 py-1.5 text-[10.5px] text-muted transition-colors hover:text-paper"
            style={{
              background:
                "color-mix(in srgb, var(--color-paper) 5%, transparent)",
              border:
                "1px solid color-mix(in srgb, var(--color-paper) 8%, transparent)",
            }}
          >
            {value}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 gap-2.5 lg:grid-cols-[210px_minmax(0,1fr)_330px]">
        <aside className="glass hidden min-h-0 overflow-y-auto rounded-3xl p-4 lg:block">
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
                <p className="text-xs text-muted">
                  <strong className="text-paper">{visibleProducts.length}</strong>{" "}
                  opciones visibles para{" "}
                  <span className="medida-chip text-paper">{query}</span>
                </p>
                <p className="hidden text-[10px] text-faint sm:block">
                  Los mensajes usan exactamente estos filtros
                </p>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2 2xl:grid-cols-3">
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

        <aside className="glass hidden min-h-0 overflow-y-auto rounded-3xl p-4 lg:block">
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

      <div className="glass-strong fixed inset-x-3 bottom-20 z-30 flex items-center gap-2 rounded-2xl p-2.5 shadow-pop lg:hidden">
        <button
          onClick={() => void copyOptions("customer")}
          className="flex-1 rounded-xl bg-paper/[.07] px-2 py-2 text-[10px] font-extrabold"
        >
          📋 {visibleProducts.length} opciones
        </button>
        <button
          onClick={() => void createComparisonPdf()}
          disabled={compareProducts.length < 2}
          className="flex-1 rounded-xl bg-paper/[.07] px-2 py-2 text-[10px] font-extrabold disabled:opacity-35"
        >
          ⚖ Comparar {compareProducts.length}/3
        </button>
        <button
          onClick={() => void createQuotePdf()}
          disabled={!quoteProduct}
          className="btn-aurora flex-1 rounded-xl px-2 py-2 text-[10px] font-extrabold disabled:opacity-35"
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
        className="glass flex min-w-60 flex-1 items-center gap-2 rounded-2xl px-3 py-2.5 sm:max-w-xl"
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch();
        }}
      >
        <IconSearch size={17} className="shrink-0 text-faint" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Medida, código, marca o diseño…"
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-faint"
        />
        <button
          type="submit"
          disabled={loading}
          className="btn-aurora rounded-xl px-4 py-2 text-xs font-extrabold disabled:opacity-50"
        >
          Buscar
        </button>
      </form>
      <button
        onClick={() => void runSearch()}
        className="glass grid h-11 w-11 place-items-center rounded-xl text-muted hover:text-paper"
        title="Actualizar búsqueda"
      >
        <IconRefresh size={17} className={loading ? "animate-spin" : ""} />
      </button>
      {catalogMeta && (
        <span className="glass hidden items-center gap-2 rounded-full px-3 py-2 text-[11px] font-bold text-muted md:flex">
          <span className="pulse-dot" />
          {catalogMeta.items} llantas · {catalogMeta.source ?? "catálogo"}
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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="glass overflow-hidden rounded-3xl"
      style={{
        borderColor: selected ? "var(--color-violet)" : undefined,
        opacity: disabled ? 0.68 : 1,
      }}
    >
      <button
        onClick={onPreview}
        className="relative block aspect-[16/10] w-full overflow-hidden bg-[#f8f7f2]"
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
        <span
          className="absolute top-3 left-3 rounded-full px-2.5 py-1 text-[10px] font-extrabold text-white"
          style={{ background: brandColor(product.brand) }}
        >
          {product.brand}
        </span>
        <AvailabilityBadge value={product.availability} />
      </button>
      <div className="p-4">
        <p className="truncate text-base font-extrabold text-paper">
          {product.design}
        </p>
        <p className="mt-1 medida-chip text-xs text-muted">
          {product.sizeLabel ?? product.name}
        </p>
        {product.loadSpeed && (
          <p className="mt-1 text-[10.5px] text-faint">{specLabel(product)}</p>
        )}
        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <p className="microlabel">Precio hoy</p>
            <p className="tnum mt-1 text-xl font-extrabold text-lime">
              {money(product.salePrice)}
            </p>
            <p className="tnum text-[10px] text-faint">
              <span className="line-through">{money(product.listPrice)}</span>{" "}
              <span className="font-extrabold text-ok">
                −{product.discountPercent}%
              </span>
            </p>
          </div>
          <button
            onClick={onToggle}
            disabled={disabled}
            className={`grid h-10 w-10 place-items-center rounded-xl font-bold transition-all ${
              selected
                ? "btn-aurora"
                : "bg-paper/[.06] text-muted hover:text-paper"
            } disabled:cursor-not-allowed disabled:opacity-40`}
            aria-label={
              selected ? "Quitar de comparación" : "Agregar a comparación"
            }
            title="Comparar modelo"
          >
            {selected ? <IconCheck size={18} /> : "⚖"}
          </button>
        </div>
        <div className="mt-3 border-t border-paper/[.06] pt-3 text-[10px] leading-relaxed text-muted">
          <p>⭐ {product.warranty.factory}</p>
          {product.warranty.roadHazard && (
            <p>🔒 {product.warranty.roadHazard}</p>
          )}
        </div>
        <button
          onClick={onQuote}
          disabled={disabled}
          className="btn-aurora mt-3 w-full rounded-xl px-3 py-2.5 text-xs font-extrabold disabled:opacity-40"
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
      <div className="mb-3 flex items-center justify-between">
        <p className="microlabel">Marcas visibles</p>
        <span className="tnum text-[9px] text-faint">
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
          color={brandColor(value)}
          onClick={() => toggleBrand(value)}
        />
      ))}

      <p className="microlabel mt-6 mb-3">Disponibilidad visible</p>
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
        color="var(--color-ok)"
        onClick={() => toggleAvailability("available")}
      />
      <CheckFilter
        label="Consultar"
        count={count("check")}
        checked={selectedAvailability.includes("check")}
        color="var(--color-sand)"
        onClick={() => toggleAvailability("check")}
      />
      <CheckFilter
        label="Agotada"
        count={count("out")}
        checked={selectedAvailability.includes("out")}
        color="var(--color-red)"
        onClick={() => toggleAvailability("out")}
      />

      <p className="microlabel mt-6 mb-3">Orden</p>
      <select
        value={sort}
        onChange={(event) => setSort(event.target.value as Sort)}
        className="w-full rounded-xl bg-paper/[.06] px-3 py-2 text-xs font-bold outline-none"
      >
        <option value="brand">Por marca</option>
        <option value="price-asc">Menor precio hoy</option>
        <option value="price-desc">Mayor precio hoy</option>
      </select>

      <div className="mt-6 rounded-2xl bg-paper/[.045] p-3 text-[10px] leading-relaxed text-muted">
        El mensaje para cliente y la imagen incluyen únicamente las opciones
        que dejan activas estos filtros.
      </div>
    </div>
  );
}

function CheckFilter({
  label,
  count,
  checked,
  color,
  onClick,
}: {
  label: string;
  count: number;
  checked: boolean;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="mb-1 flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[11px] font-bold transition-colors"
      style={{
        color: checked ? "var(--color-paper)" : "var(--color-muted)",
        background: checked
          ? "color-mix(in srgb, var(--color-violet) 13%, transparent)"
          : "transparent",
      }}
    >
      <span
        className="grid h-4 w-4 place-items-center rounded-full border text-[9px]"
        style={{
          color: checked ? "white" : "transparent",
          borderColor: color ?? "var(--color-faint)",
          background: checked ? color ?? "var(--color-violet)" : "transparent",
        }}
      >
        ✓
      </span>
      <span className="flex-1">{label}</span>
      <span className="tnum rounded-full bg-paper/[.06] px-1.5 py-0.5 text-[9.5px]">
        {count}
      </span>
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
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-paper/[.04] p-1">
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
        <p className="mt-auto rounded-xl bg-paper/[.06] px-3 py-2 text-[10.5px] text-muted">
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
      <p className="microlabel">Opciones filtradas</p>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        Estas acciones usan las {products.length} llantas visibles en el centro,
        agrupadas por marca. No dependen de la comparativa.
      </p>
      <label className="microlabel mt-5">Cliente</label>
      <input
        value={customerName}
        onChange={(event) => setCustomerName(event.target.value)}
        className="mt-2 w-full rounded-xl bg-paper/[.055] px-3 py-2.5 text-xs font-semibold outline-none"
        placeholder="Nombre opcional"
      />
      <div className="mt-auto pt-5">
        <ActionButton
          onClick={() => void copyOptions("distributor")}
          loading={action === "options-distributor"}
          disabled={Boolean(action) || !products.length}
          label="📋 Copiar mensaje distribuidor"
        />
        <ActionButton
          onClick={() => void copyOptions("customer")}
          loading={action === "options-customer"}
          disabled={Boolean(action) || !products.length}
          label="📋 Copiar mensaje cliente final"
          primary
        />
        <ActionButton
          onClick={() => void createImage()}
          loading={action === "options-image"}
          disabled={Boolean(action) || !products.length}
          label="📷 Guardar imagen para WhatsApp"
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
      <p className="microlabel">Comparar alternativas</p>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        Elige 2–3 modelos. Se comparan por unidad; aquí nunca se suman como una
        compra.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {products.map((product) => (
          <div
            key={product.id}
            className="flex items-center gap-2 rounded-2xl bg-paper/[.045] p-3"
          >
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                className="h-12 w-12 rounded-lg bg-white object-contain"
                alt=""
              />
            ) : (
              <IconTire size={30} className="text-faint" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-extrabold">
                {product.brand} {product.design}
              </p>
              <p className="tnum mt-0.5 text-[10px] text-lime">
                {money(product.salePrice)}
              </p>
            </div>
            <button
              onClick={() => remove(product.id)}
              className="text-faint hover:text-red"
            >
              <IconX size={14} />
            </button>
          </div>
        ))}
      </div>
      {!ready && (
        <p className="mt-4 rounded-xl bg-paper/[.04] p-3 text-[10.5px] text-muted">
          Selecciona al menos dos modelos con el botón ⚖ de cada tarjeta.
        </p>
      )}
      <div className="mt-auto pt-5">
        <ActionButton
          onClick={() => void copyMessage()}
          loading={action === "compare-message"}
          disabled={Boolean(action) || !ready}
          label="📋 Copiar comparativa"
        />
        <ActionButton
          onClick={() => void createImage()}
          loading={action === "compare-image"}
          disabled={Boolean(action) || !ready}
          label="📷 Imagen comparativa"
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
          <IconTire size={42} className="mx-auto text-faint" />
          <p className="mt-3 text-xs font-bold">Elige una llanta</p>
          <p className="mt-1 text-[10.5px] text-muted">
            Pulsa “Cotizar esta llanta” en el modelo decidido.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col pt-4">
      <p className="microlabel">Cotización final</p>
      <div className="mt-3 flex items-center gap-3 rounded-2xl bg-paper/[.045] p-3">
        {product.imageUrl && (
          <img
            src={product.imageUrl}
            alt=""
            className="h-16 w-16 rounded-xl bg-white object-contain"
          />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold">
            {product.brand} {product.design}
          </p>
          <p className="medida-chip mt-1 text-[10px] text-muted">
            {product.sizeLabel}
          </p>
          <p className="tnum mt-1 text-xs font-extrabold text-lime">
            {money(product.salePrice)} c/u
          </p>
        </div>
      </div>
      <label className="microlabel mt-5">Cliente</label>
      <input
        value={customerName}
        onChange={(event) => setCustomerName(event.target.value)}
        className="mt-2 w-full rounded-xl bg-paper/[.055] px-3 py-2.5 text-xs font-semibold outline-none"
        placeholder="Nombre del cliente"
      />
      <div className="mt-4 flex items-end justify-between gap-3">
        <label className="text-[10px] font-bold text-muted">
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
            className="tnum mt-2 block w-20 rounded-xl bg-paper/[.07] px-3 py-2 text-center text-sm font-bold outline-none"
          />
        </label>
        <div className="text-right">
          <p className="microlabel">Total con IVA</p>
          <p className="tnum mt-1 text-2xl font-extrabold text-lime">
            {money(product.salePrice * quantity)}
          </p>
        </div>
      </div>
      <div className="mt-auto pt-5">
        <ActionButton
          onClick={() => void copyMessage()}
          loading={action === "quote-message"}
          disabled={Boolean(action)}
          label="📋 Copiar cotización"
        />
        <ActionButton
          onClick={() => void createImage()}
          loading={action === "quote-image"}
          disabled={Boolean(action)}
          label="📷 Imagen de cotización"
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
      className="rounded-lg px-1.5 py-2 text-[9.5px] font-extrabold transition-colors"
      style={{
        color: active ? "var(--color-paper)" : "var(--color-muted)",
        background: active
          ? "color-mix(in srgb, var(--color-violet) 24%, transparent)"
          : "transparent",
      }}
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
      className={`mb-2 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-extrabold disabled:opacity-40 ${
        primary
          ? "btn-aurora"
          : success
            ? "bg-ok/90 text-white"
            : "bg-paper/[.07]"
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
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
        >
          <motion.div
            className="relative w-full max-w-xl rounded-3xl bg-[#f8f7f2] p-5 text-[#14213d] shadow-pop"
            initial={{ scale: 0.94, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 10 }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              onClick={close}
              className="absolute top-4 right-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-[#14213d]/10"
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
              <p className="text-xl font-black">{product.design}</p>
              <p className="mt-1 text-sm text-[#667085]">
                {product.brand} · {product.sizeLabel}
              </p>
              {product.imageUrl && (
                <a
                  href={product.imageUrl}
                  download={`${product.brand}-${product.design}.jpg`}
                  className="mt-4 inline-flex rounded-xl bg-[#d62828] px-5 py-2.5 text-xs font-extrabold text-white"
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
    <div className="grid h-full min-h-40 place-items-center bg-[radial-gradient(circle_at_center,#fff_0%,#efede7_70%)]">
      <div className="text-center">
        <IconTire size={64} className="mx-auto text-[#8f96a3]" />
        <p className="mt-2 text-[10px] font-black tracking-[.18em] text-[#667085] uppercase">
          {brand} · imagen en validación
        </p>
      </div>
    </div>
  );
}

function AvailabilityBadge({ value }: { value: CatalogAvailability }) {
  const meta = {
    available: { label: "Disponible", color: "var(--color-ok)" },
    check: { label: "Consultar", color: "var(--color-sand)" },
    out: { label: "Agotada", color: "var(--color-red)" },
  }[value];
  return (
    <span
      className="absolute top-3 right-3 rounded-full px-2.5 py-1 text-[10px] font-extrabold"
      style={{
        color: meta.color,
        background: `color-mix(in srgb, ${meta.color} 14%, white)`,
        border: `1px solid color-mix(in srgb, ${meta.color} 40%, transparent)`,
      }}
    >
      ● {meta.label}
    </span>
  );
}

function EmptyFilters({ reset }: { reset: () => void }) {
  return (
    <div className="glass grid min-h-72 place-items-center rounded-3xl p-8 text-center">
      <div>
        <IconTire size={46} className="mx-auto text-faint" />
        <p className="mt-4 text-sm font-bold">
          No hay opciones con estos filtros
        </p>
        <button
          onClick={reset}
          className="mt-4 rounded-xl bg-paper/[.07] px-4 py-2 text-xs font-extrabold"
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
    <div className="glass grid min-h-80 place-items-center rounded-3xl p-8 text-center">
      <div className="max-w-sm">
        <p className="text-3xl">🔐</p>
        <p className="mt-4 text-sm font-extrabold">
          No pudimos abrir el catálogo
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted">{message}</p>
        <div className="mt-5 flex justify-center gap-2">
          <button
            onClick={onConfigure}
            className="btn-aurora rounded-xl px-4 py-2.5 text-xs font-extrabold"
          >
            Ingresar clave
          </button>
          <button
            onClick={onRetry}
            className="rounded-xl bg-paper/[.06] px-4 py-2.5 text-xs font-bold"
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
    <div className="grid gap-2.5 sm:grid-cols-2 2xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="glass overflow-hidden rounded-3xl"
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

function brandColor(brand: string): string {
  const normalized = brand.toLowerCase();
  if (normalized.includes("falken")) return "#1f4e8c";
  if (normalized.includes("kenda")) return "#d62828";
  if (normalized.includes("winrun")) return "#16836b";
  return "#8a8368";
}

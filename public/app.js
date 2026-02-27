const grid = document.getElementById("grid");
const statusEl = document.getElementById("status");
const subtitleEl = document.getElementById("subtitle");
const countPill = document.getElementById("countPill");
const searchInput = document.getElementById("searchInput");
const clearBtn = document.getElementById("clearBtn");
const reloadBtn = document.getElementById("reloadBtn");
const sentinel = document.getElementById("sentinel");
const tpl = document.getElementById("cardTemplate");
const detailDialog = document.getElementById("detailDialog");
const dialogTitle = document.getElementById("dialogTitle");
const dialogSubtitle = document.getElementById("dialogSubtitle");
const dialogTypes = document.getElementById("dialogTypes");
const dialogAbilities = document.getElementById("dialogAbilities");
const dialogStats = document.getElementById("dialogStats");
const dialogStatus = document.getElementById("dialogStatus");

const state = {
  loading: false,
  done: false,
  total: null,
  offset: 0,
  limit: 60,
  search: "",
  lastRequestId: 0,
};

function padId(id) {
  return `#${String(id).padStart(4, "0")}`;
}

function chip(text, kind) {
  const el = document.createElement("span");
  el.className = `chip ${kind ? `chip--${kind}` : ""}`.trim();
  el.textContent = text;
  return el;
}

function setStatus(text, kind = "muted") {
  statusEl.textContent = text ?? "";
  statusEl.classList.remove("status--error", "status--ok");
  if (kind === "error") statusEl.classList.add("status--error");
  if (kind === "ok") statusEl.classList.add("status--ok");
}

function updateHeader() {
  const total = state.total == null ? "—" : state.total.toLocaleString();
  const shown = grid.childElementCount.toLocaleString();
  subtitleEl.textContent = state.search
    ? `Resultados para “${state.search}”`
    : "Lista completa (desde SQLite)";
  countPill.textContent = `${shown} / ${total}`;
}

function clearGrid() {
  grid.replaceChildren();
  state.offset = 0;
  state.done = false;
  state.total = null;
  updateHeader();
}

function createCard(p) {
  const node = tpl.content.firstElementChild.cloneNode(true);
  const img = node.querySelector(".card__img");
  const idEl = node.querySelector(".card__id");
  const nameEl = node.querySelector(".card__name");
  const tagsEl = node.querySelector(".card__tags");
  const abilitiesEl = node.querySelector(".card__abilities");

  idEl.textContent = padId(p.id);
  nameEl.textContent = p.name;

  img.alt = `${p.name} (${padId(p.id)})`;
  img.src = p.imageUrl;
  img.addEventListener("error", () => {
    img.src =
      "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='512' height='512'>
          <rect width='100%' height='100%' fill='rgba(255,255,255,.06)'/>
          <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle'
            font-family='system-ui,-apple-system,Segoe UI,Roboto' font-size='18' fill='rgba(255,255,255,.75)'>
            Imagen no disponible
          </text>
        </svg>`
      );
  }, { once: true });

  const types = Array.isArray(p.types) ? p.types : [];
  const abilities = Array.isArray(p.abilities) ? p.abilities : [];

  tagsEl.replaceChildren();
  abilitiesEl.replaceChildren();

  if (types.length === 0) {
    tagsEl.appendChild(chip("Tipos: cargar…", "muted"));
  } else {
    for (const t of types.slice(0, 3)) tagsEl.appendChild(chip(t, "type"));
  }

  if (abilities.length === 0) {
    abilitiesEl.appendChild(chip("Habilidades: cargar…", "muted"));
  } else {
    for (const a of abilities.slice(0, 3)) abilitiesEl.appendChild(chip(a, "ability"));
  }

  node.dataset.pokemonId = String(p.id);
  node.addEventListener("click", () => openDetails({ id: p.id, name: p.name }), { passive: true });

  // Si el backend aún no tiene detalles cacheados, los pedimos cuando se vea la card
  if (!p.hasDetails) cardDetailObserver.observe(node);

  return node;
}

async function fetchPage({ offset, limit, search }) {
  const url = new URL("/api/pokemon", window.location.origin);
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("limit", String(limit));
  if (search) url.searchParams.set("search", search);

  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  return await res.json();
}

async function fetchDetails(id) {
  const res = await fetch(`/api/pokemon/${id}`, { headers: { accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  return await res.json();
}

function renderChips(container, list, kind) {
  container.replaceChildren();
  const items = Array.isArray(list) ? list : [];
  if (items.length === 0) {
    container.appendChild(chip("—", "muted"));
    return;
  }
  for (const x of items) container.appendChild(chip(String(x), kind));
}

function statRow({ name, base }) {
  const row = document.createElement("div");
  row.className = "stat";

  const n = document.createElement("div");
  n.className = "stat__name";
  n.textContent = name;

  const v = document.createElement("div");
  v.className = "stat__value";
  v.textContent = String(base);

  const bar = document.createElement("div");
  bar.className = "stat__bar";
  const fill = document.createElement("div");
  fill.className = "stat__barFill";
  // 255 es el máximo teórico en Gen 1; aquí solo para visual.
  const pct = Math.max(0, Math.min(100, Math.round((Number(base) / 255) * 100)));
  fill.style.width = `${pct}%`;
  bar.appendChild(fill);

  row.appendChild(n);
  row.appendChild(v);
  row.appendChild(bar);
  return row;
}

async function openDetails({ id, name }) {
  dialogTitle.textContent = name ? String(name).replace(/^\w/, (c) => c.toUpperCase()) : "Pokémon";
  dialogSubtitle.textContent = padId(id);
  dialogStatus.textContent = "Cargando detalle…";
  renderChips(dialogTypes, [], "type");
  renderChips(dialogAbilities, [], "ability");
  dialogStats.replaceChildren();

  if (typeof detailDialog.showModal === "function") detailDialog.showModal();
  else detailDialog.setAttribute("open", "");

  try {
    const d = detailCache.get(id) ?? (await fetchDetails(id));
    detailCache.set(id, d);
    renderChips(dialogTypes, d.types, "type");
    renderChips(dialogAbilities, d.abilities, "ability");

    const stats = Array.isArray(d?.stats) ? d.stats : [];
    dialogStats.replaceChildren();
    if (stats.length === 0) {
      dialogStats.appendChild(chip("Sin stats", "muted"));
    } else {
      for (const s of stats) dialogStats.appendChild(statRow({ name: s.name, base: s.base }));
    }

    dialogStatus.textContent = "Tip: estos datos se guardan en tu SQLite (cache).";
  } catch (err) {
    dialogStatus.textContent = `Error cargando detalle: ${String(err?.message ?? err)}`;
  }
}

async function loadMore() {
  if (state.loading || state.done) return;
  state.loading = true;
  const requestId = ++state.lastRequestId;

  setStatus("Cargando…");

  try {
    const data = await fetchPage({
      offset: state.offset,
      limit: state.limit,
      search: state.search,
    });

    if (requestId !== state.lastRequestId) return;

    const results = Array.isArray(data?.results) ? data.results : [];
    state.total = Number.isFinite(data?.total) ? data.total : state.total;

    for (const p of results) grid.appendChild(createCard(p));
    state.offset += results.length;

    updateHeader();

    if (results.length === 0 || state.offset >= (state.total ?? Infinity)) {
      state.done = true;
      setStatus(state.offset === 0 ? "Sin resultados." : "Listo.", "ok");
      return;
    }

    setStatus(`Cargados ${results.length}. Baja para continuar…`);
  } catch (err) {
    if (requestId !== state.lastRequestId) return;
    setStatus(`Error cargando: ${String(err?.message ?? err)}`, "error");
  } finally {
    if (requestId === state.lastRequestId) state.loading = false;
  }
}

function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

const onSearch = debounce(() => {
  state.search = String(searchInput.value ?? "").trim().toLowerCase();
  state.lastRequestId++;
  clearGrid();
  loadMore();
}, 250);

searchInput.addEventListener("input", onSearch);
clearBtn.addEventListener("click", () => {
  searchInput.value = "";
  searchInput.focus();
  onSearch();
});
reloadBtn.addEventListener("click", () => {
  state.lastRequestId++;
  clearGrid();
  loadMore();
});

const io = new IntersectionObserver(
  (entries) => {
    if (entries.some((e) => e.isIntersecting)) loadMore();
  },
  { rootMargin: "800px 0px" }
);
io.observe(sentinel);

// Prefetch de detalle (tipos/habilidades) solo para cards visibles
const detailCache = new Map(); // id -> { types, abilities, stats }
const detailQueue = [];
const detailQueued = new Set();
let detailInFlight = 0;
const MAX_DETAIL_CONCURRENCY = 6;

function pumpDetailQueue() {
  while (detailInFlight < MAX_DETAIL_CONCURRENCY && detailQueue.length > 0) {
    const job = detailQueue.shift();
    if (!job) break;
    if (detailCache.has(job.id)) continue;

    detailInFlight++;
    fetchDetails(job.id)
      .then((d) => {
        detailCache.set(job.id, d);
        const tagsEl = job.card.querySelector(".card__tags");
        const abilitiesEl = job.card.querySelector(".card__abilities");
        if (tagsEl) renderChips(tagsEl, d.types, "type");
        if (abilitiesEl) renderChips(abilitiesEl, d.abilities, "ability");
      })
      .catch(() => {})
      .finally(() => {
        detailInFlight--;
        pumpDetailQueue();
      });
  }
}

const cardDetailObserver = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const card = e.target;
      cardDetailObserver.unobserve(card);

      const id = Number(card?.dataset?.pokemonId);
      if (!Number.isInteger(id) || id <= 0) continue;
      if (detailCache.has(id)) continue;
      if (detailQueued.has(id)) continue;

      detailQueued.add(id);
      detailQueue.push({ id, card });
      pumpDetailQueue();
    }
  },
  { rootMargin: "600px 0px" }
);

// Primera carga
loadMore();


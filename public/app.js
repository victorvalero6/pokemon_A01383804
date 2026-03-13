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
  if (BATTLE.mode) {
    BATTLE.selected = [];
    refreshSelectionBar();
  }
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
  node.addEventListener("click", () => {
    if (BATTLE.mode) toggleCardSelection(p.id, p.name, p.imageUrl);
    else openDetails({ id: p.id, name: p.name });
  }, { passive: true });

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
      .catch(() => { })
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

// =============================================================
// BATTLE SYSTEM
// =============================================================

const BATTLE = {
  mode: false,
  selected: [],   // [{id, name, imageUrl}] — max 2
  result: null,
  animating: false,
};

// DOM refs — battle UI
const battleModeBtn  = document.getElementById("battleModeBtn");
const battleBar      = document.getElementById("battleBar");
const battleSlot1    = document.getElementById("battleSlot1");
const battleSlot2    = document.getElementById("battleSlot2");
const doFightBtn     = document.getElementById("doFightBtn");
const battleArena    = document.getElementById("battleArena");
const closeBattleBtn = document.getElementById("closeBattleBtn");
const bfighter1      = document.getElementById("bfighter1");
const bfighter2      = document.getElementById("bfighter2");
const battleLog      = document.getElementById("battleLog");
const battleWinner   = document.getElementById("battleWinner");
const winnerImg      = document.getElementById("winnerImg");
const winnerNameEl   = document.getElementById("winnerName");
const battleStartBtn = document.getElementById("battleStartBtn");
const battleAgainBtn = document.getElementById("battleAgainBtn");
const mainContainer  = document.querySelector("main.container");

// ── helpers ──────────────────────────────────────────────────
function cap(s) {
  if (!s) return "";
  return String(s).charAt(0).toUpperCase() + String(s).slice(1);
}

function getStat(stats, name) {
  if (!Array.isArray(stats)) return 50;
  return stats.find((s) => s.name === name)?.base ?? 50;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Battle Mode Toggle ────────────────────────────────────────
battleModeBtn.addEventListener("click", () => {
  BATTLE.mode = !BATTLE.mode;
  battleModeBtn.classList.toggle("btn--active", BATTLE.mode);
  battleBar.hidden = !BATTLE.mode;
  if (!BATTLE.mode) {
    BATTLE.selected = [];
    refreshSelectionBar();
    document.querySelectorAll(".card--selected").forEach((c) => c.classList.remove("card--selected"));
  }
});

// ── Card Selection ────────────────────────────────────────────
function toggleCardSelection(id, name, imageUrl) {
  const idx  = BATTLE.selected.findIndex((s) => s.id === id);
  const card = document.querySelector(`.card[data-pokemon-id="${id}"]`);
  if (idx >= 0) {
    BATTLE.selected.splice(idx, 1);
    card?.classList.remove("card--selected");
  } else {
    if (BATTLE.selected.length >= 2) return;
    BATTLE.selected.push({ id, name, imageUrl });
    card?.classList.add("card--selected");
  }
  refreshSelectionBar();
}

function refreshSelectionBar() {
  [0, 1].forEach((i) => {
    const slot = i === 0 ? battleSlot1 : battleSlot2;
    const p    = BATTLE.selected[i];
    if (p) {
      slot.innerHTML = `<img src="${p.imageUrl}" alt="${p.name}"><span>${cap(p.name)}</span>`;
      slot.classList.add("battle-slot--filled");
    } else {
      slot.innerHTML = `<span class="battle-slot__empty">Pokémon ${i + 1}</span>`;
      slot.classList.remove("battle-slot--filled");
    }
  });
  doFightBtn.disabled = BATTLE.selected.length < 2;
}

// ── Start Battle (fetch data + open arena) ────────────────────
doFightBtn.addEventListener("click", async () => {
  if (BATTLE.selected.length < 2 || BATTLE.animating) return;
  doFightBtn.disabled = true;
  doFightBtn.textContent = "⏳ Cargando…";

  try {
    const [s1, s2] = BATTLE.selected;

    let d1 = detailCache.get(s1.id);
    let d2 = detailCache.get(s2.id);
    if (!d1) { d1 = await fetchDetails(s1.id); detailCache.set(s1.id, d1); }
    if (!d2) { d2 = await fetchDetails(s2.id); detailCache.set(s2.id, d2); }

    const p1 = { name: s1.name, imageUrl: s1.imageUrl, stats: d1.stats };
    const p2 = { name: s2.name, imageUrl: s2.imageUrl, stats: d2.stats };

    openBattleArena(simulateBattle(p1, p2), p1, p2);
  } catch (err) {
    doFightBtn.disabled = false;
    doFightBtn.textContent = "⚔️ ¡Batallar!";
    setStatus(`Error al cargar datos para la batalla: ${err.message}`, "error");
  }
});

function openBattleArena(result, p1, p2) {
  BATTLE.result    = result;
  BATTLE.animating = false;

  mainContainer.hidden = true;
  battleBar.hidden     = true;
  battleArena.hidden   = false;

  initFighter(bfighter1, p1);
  initFighter(bfighter2, p2);
  updateHpBar(bfighter1, 100);
  updateHpBar(bfighter2, 100);

  battleLog.innerHTML  = "";
  battleWinner.hidden  = true;
  battleStartBtn.hidden = false;
  battleAgainBtn.hidden = true;

  window.scrollTo({ top: 0 });
}

function initFighter(el, pData) {
  el.querySelector(".bf__name").textContent = cap(pData.name);
  const img = el.querySelector(".bf__img");
  img.src = pData.imageUrl;
  img.alt = pData.name;
  el.classList.remove("bf--hit", "bf--winner");
}

function updateHpBar(el, pct) {
  const fill  = el.querySelector(".bf__hp-fill");
  const text  = el.querySelector(".bf__hp-text");
  const color = pct > 50 ? "#22c55e" : pct > 25 ? "#f59e0b" : "#ef4444";
  fill.style.width      = `${pct}%`;
  fill.style.background = color;
  text.textContent      = `${pct}%`;
  text.style.color      = color;
}

// ── Close / Restart ──────────────────────────────────────────
closeBattleBtn.addEventListener("click", () => {
  battleArena.hidden   = true;
  mainContainer.hidden = false;
  BATTLE.animating     = false;
  if (BATTLE.mode) battleBar.hidden = false;
  doFightBtn.disabled    = BATTLE.selected.length < 2;
  doFightBtn.textContent = "⚔️ ¡Batallar!";
});

battleAgainBtn.addEventListener("click", () => {
  battleArena.hidden   = true;
  mainContainer.hidden = false;
  BATTLE.selected      = [];
  BATTLE.animating     = false;
  refreshSelectionBar();
  document.querySelectorAll(".card--selected").forEach((c) => c.classList.remove("card--selected"));
  if (BATTLE.mode) battleBar.hidden = false;
  doFightBtn.textContent = "⚔️ ¡Batallar!";
});

// ── Battle Animation ─────────────────────────────────────────
battleStartBtn.addEventListener("click", () => {
  if (!BATTLE.result || BATTLE.animating) return;
  runBattle();
});

async function runBattle() {
  BATTLE.animating      = true;
  battleStartBtn.hidden = true;
  battleLog.innerHTML   = "";

  const { steps, winner, f1, f2 } = BATTLE.result;

  // Reset HP bars to 100 before animating
  updateHpBar(bfighter1, 100);
  updateHpBar(bfighter2, 100);

  for (const step of steps) {
    await sleep(1000);
    appendStep(step);

    const defEl = step.defenderNum === f1.num ? bfighter1 : bfighter2;
    updateHpBar(defEl, step.defenderHpPct);

    if (!step.atkMiss) {
      defEl.classList.add("bf--hit");
      setTimeout(() => defEl.classList.remove("bf--hit"), 380);
    }
  }

  await sleep(1200);

  // Mark winner fighter
  const winnerFighterEl = winner.num === f1.num ? bfighter1 : bfighter2;
  winnerFighterEl.classList.add("bf--winner");

  // Show winner section
  winnerImg.src          = winner.image;
  winnerImg.alt          = winner.name;
  winnerNameEl.textContent = cap(winner.name);
  battleWinner.hidden    = false;
  battleAgainBtn.hidden  = false;
  BATTLE.animating       = false;

  setTimeout(() => battleWinner.scrollIntoView({ behavior: "smooth" }), 100);
}

function appendStep(step) {
  const el = document.createElement("div");
  el.className = `battle-step${step.attackerNum === 1 ? " step--p1" : " step--p2"}`;

  const atkLabel = step.useSpAtk ? "⚡ Ataque Especial" : "👊 Ataque Normal";
  const defLabel = step.useSpDef ? "🛡️ Defensa Especial" : "🔰 Defensa Normal";

  let html = `<div class="step__header">
    <span class="step__turn">Turno ${step.turn}</span>
    <span class="step__attacker">${cap(step.attackerName)}</span>
    <span class="step__action">usa <strong>${atkLabel}</strong></span>
  </div>`;

  if (step.atkMiss) {
    html += `<div class="step__miss">💨 ¡El ataque falló! ${cap(step.attackerName)} erró el golpe.</div>`;
  } else {
    html += `<div class="step__defense">${cap(step.defenderName)} usa <strong>${defLabel}</strong>`;
    if (step.defMiss) html += ` <span class="step__def-fail">— ¡La defensa falló!</span>`;
    html += `</div>`;
    html += `<div class="step__damage">💥 <strong>−${step.dmgPct}%</strong> de vida</div>`;
    html += `<div class="step__hp">❤️ Vida de ${cap(step.defenderName)}: <strong>${step.defenderHpPct}%</strong></div>`;
  }

  el.innerHTML = html;
  battleLog.appendChild(el);
  battleLog.scrollTop = battleLog.scrollHeight;
}

// ── Battle Simulation Engine ──────────────────────────────────

function simulateBattle(p1data, p2data) {
  const make = (d, num) => ({
    num,
    name:  d.name,
    image: d.imageUrl,
    hpPct: 100,
    atk:   getStat(d.stats, "attack"),
    def:   getStat(d.stats, "defense"),
    spAtk: getStat(d.stats, "special-attack"),
    spDef: getStat(d.stats, "special-defense"),
    speed: getStat(d.stats, "speed"),
    // Turn counters for cooldown logic
    atkTurns:       0,   // how many times this Pokémon has attacked
    defTurns:       0,   // how many times this Pokémon has defended
    lastSpAtkTurn:  0,   // atkTurns value when special attack was last used
    lastSpDefTurn:  0,   // defTurns value when special defense was last used
  });

  const f1 = make(p1data, 1);
  const f2 = make(p2data, 2);

  // Speed determines who goes first (tie → random)
  const [first, second] =
    f1.speed > f2.speed ? [f1, f2] :
    f2.speed > f1.speed ? [f2, f1] :
    Math.random() < 0.5 ? [f1, f2] : [f2, f1];

  const steps = [];
  let round   = 0;

  while (f1.hpPct > 0 && f2.hpPct > 0 && round < 40) {
    round++;
    steps.push(doAttack(first, second, round * 2 - 1));
    if (second.hpPct <= 0) break;
    steps.push(doAttack(second, first, round * 2));
  }

  // Whoever has more HP remaining wins
  const winner = f1.hpPct >= f2.hpPct ? f1 : f2;
  return { steps, winner, f1, f2 };
}

/**
 * Simulates one attack from attacker → defender.
 *
 * Cooldown rules:
 *   Special Attack  — requires ≥3 own attack turns since last use
 *   Special Defense — requires ≥2 own defense turns since last use
 *
 * Miss rules (each independent, ~12% chance):
 *   atkMiss — attacker whiffs completely (0 damage)
 *   defMiss — defender's chosen defense fails (max damage, no reduction)
 */
function doAttack(attacker, defender, turnNum) {
  attacker.atkTurns++;
  defender.defTurns++;

  // Cooldown checks
  const canSpAtk = (attacker.atkTurns - attacker.lastSpAtkTurn) >= 3;
  const canSpDef = (defender.defTurns - defender.lastSpDefTurn) >= 2;

  // AI decision — use special when available, with some randomness
  const useSpAtk = canSpAtk && Math.random() < 0.65;
  const useSpDef = canSpDef && Math.random() < 0.55;

  if (useSpAtk) attacker.lastSpAtkTurn = attacker.atkTurns;
  if (useSpDef) defender.lastSpDefTurn = defender.defTurns;

  // Miss chances
  const atkMiss = Math.random() < 0.12;
  const defMiss = Math.random() < 0.12;

  let dmgPct = 0;

  if (!atkMiss) {
    const atkStat = useSpAtk ? attacker.spAtk : attacker.atk;
    // If defense fails → treat as if defStat = 1 (full damage)
    const defStat = defMiss ? 1 : (useSpDef ? defender.spDef : defender.def);

    // Damage formula: result is % of max HP, clamped 3–40
    const ratio    = atkStat / Math.max(defStat, 1);
    const variance = 0.85 + Math.random() * 0.3;
    dmgPct = Math.max(3, Math.min(40, Math.round(ratio * 15 * variance)));

    defender.hpPct = Math.max(0, Math.round(defender.hpPct - dmgPct));
  }

  return {
    turn:          turnNum,
    attackerNum:   attacker.num,
    attackerName:  attacker.name,
    defenderNum:   defender.num,
    defenderName:  defender.name,
    useSpAtk,
    useSpDef,
    atkMiss,
    defMiss,
    dmgPct,
    defenderHpPct: defender.hpPct,
  };
}


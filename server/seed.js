function parsePokemonIdFromUrl(url) {
  const match = String(url).match(/\/pokemon\/(\d+)\/?$/);
  return match ? Number(match[1]) : null;
}

function officialArtworkUrl(id) {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
}

export async function seedPokemonIfEmpty({ db, pokeApiBase, logger = console }) {
  const existing = db.prepare("SELECT COUNT(*) as count FROM pokemon").get();
  if ((existing?.count ?? 0) > 0) return { seeded: false, count: existing.count ?? 0 };

  logger.log("[seed] Descargando lista completa desde PokeAPI...");
  const res = await fetch(`${pokeApiBase}/pokemon?limit=2000&offset=0`, {
    headers: { "accept": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`[seed] PokeAPI error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const results = Array.isArray(data?.results) ? data.results : [];

  const rows = [];
  for (const item of results) {
    const id = parsePokemonIdFromUrl(item?.url);
    const name = String(item?.name ?? "").trim();
    if (!id || !name) continue;
    rows.push({ id, name, image_url: officialArtworkUrl(id) });
  }

  const insert = db.prepare(
    "INSERT OR IGNORE INTO pokemon (id, name, image_url) VALUES (@id, @name, @image_url)"
  );
  const tx = db.transaction((batch) => {
    for (const row of batch) insert.run(row);
  });
  tx(rows);

  const after = db.prepare("SELECT COUNT(*) as count FROM pokemon").get();
  logger.log(`[seed] Listo. Insertados: ${after?.count ?? 0}`);
  return { seeded: true, count: after?.count ?? 0 };
}


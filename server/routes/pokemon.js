import { Router } from "express";
import { fetchPokemonDetails } from "../pokeapi.js";
import { config } from "../config.js";

function normalizeList(x) {
  if (!Array.isArray(x)) return [];
  return x.map(String).map((s) => s.trim()).filter(Boolean);
}

export function pokemonRouter(db) {
  const router = Router();

  router.get("/", (req, res) => {
    const rawLimit = Number(req.query.limit ?? 60);
    const rawOffset = Number(req.query.offset ?? 0);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 60;
    const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;
    const search = String(req.query.search ?? "").trim().toLowerCase();

    const whereCount = search ? "WHERE lower(name) LIKE ?" : "";
    const whereList = search ? "WHERE lower(p.name) LIKE ?" : "";
    const params = search ? [`%${search}%`] : [];

    const totalRow = db
      .prepare(`SELECT COUNT(*) as count FROM pokemon ${whereCount}`)
      .get(...params);
    const total = totalRow?.count ?? 0;

    const rows = db
      .prepare(
        `
        SELECT
          p.id,
          p.name,
          p.image_url,
          d.types_json,
          d.abilities_json
        FROM pokemon p
        LEFT JOIN pokemon_details d ON d.pokemon_id = p.id
        ${whereList}
        ORDER BY p.id ASC
        LIMIT ? OFFSET ?
      `
      )
      .all(...params, limit, offset);

    res.json({
      total,
      offset,
      limit,
      results: rows.map((r) => {
        let types = [];
        let abilities = [];
        try {
          types = r.types_json ? normalizeList(JSON.parse(r.types_json)) : [];
          abilities = r.abilities_json ? normalizeList(JSON.parse(r.abilities_json)) : [];
        } catch {
          types = [];
          abilities = [];
        }
        return {
          id: r.id,
          name: r.name,
          imageUrl: r.image_url,
          types,
          abilities,
          hasDetails: Boolean(r.types_json && r.abilities_json),
        };
      }),
    });
  });

  router.get("/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }

    const cached = db
      .prepare(
        `
        SELECT pokemon_id, types_json, abilities_json, stats_json, updated_at
        FROM pokemon_details
        WHERE pokemon_id = ?
      `
      )
      .get(id);

    if (cached) {
      res.json({
        id,
        types: JSON.parse(cached.types_json),
        abilities: JSON.parse(cached.abilities_json),
        stats: JSON.parse(cached.stats_json),
        cachedAt: cached.updated_at,
      });
      return;
    }

    // Traer de PokeAPI y cachear
    try {
      const details = await fetchPokemonDetails({ pokeApiBase: config.pokeApiBase, idOrName: id });

      const types = normalizeList(details.types);
      const abilities = normalizeList(details.abilities);
      const stats = Array.isArray(details.stats) ? details.stats : [];

      db.prepare(
        `
        INSERT INTO pokemon_details (pokemon_id, types_json, abilities_json, stats_json, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(pokemon_id) DO UPDATE SET
          types_json = excluded.types_json,
          abilities_json = excluded.abilities_json,
          stats_json = excluded.stats_json,
          updated_at = datetime('now')
      `
      ).run(id, JSON.stringify(types), JSON.stringify(abilities), JSON.stringify(stats));

      res.json({ id, types, abilities, stats, cachedAt: new Date().toISOString() });
    } catch (err) {
      res.status(502).json({ error: "pokeapi_failed", message: String(err?.message ?? err) });
    }
  });

  return router;
}


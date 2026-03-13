import { Router } from "express";
import { fetchPokemonDetails } from "../pokeapi.js";
import { config } from "../config.js";

const normalizeList = (x) => Array.isArray(x) ? x.map(String).map((s) => s.trim()).filter(Boolean) : [];

export function pokemonRouter(db) {
  const router = Router();

  router.get("/", (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 60, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const search = String(req.query.search || "").trim().toLowerCase();

    const where = search ? "WHERE lower(name) LIKE ?" : "";
    const whereList = search ? "WHERE lower(p.name) LIKE ?" : "";
    const params = search ? [`%${search}%`] : [];

    const total = db.prepare(`SELECT COUNT(*) as count FROM pokemon ${where}`).get(...params)?.count ?? 0;
    const rows = db.prepare(`
      SELECT p.id, p.name, p.image_url, d.types_json, d.abilities_json
      FROM pokemon p LEFT JOIN pokemon_details d ON d.pokemon_id = p.id
      ${whereList} ORDER BY p.id ASC LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    res.json({
      total, offset, limit,
      results: rows.map((r) => {
        let types = [], abilities = [];
        try {
          if (r.types_json) types = normalizeList(JSON.parse(r.types_json));
          if (r.abilities_json) abilities = normalizeList(JSON.parse(r.abilities_json));
        } catch { }
        return {
          id: r.id, name: r.name, imageUrl: r.image_url, types, abilities,
          hasDetails: Boolean(r.types_json && r.abilities_json),
        };
      }),
    });
  });

  router.get("/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "invalid_id" });

    const cached = db.prepare("SELECT * FROM pokemon_details WHERE pokemon_id = ?").get(id);
    if (cached) {
      return res.json({
        id, types: JSON.parse(cached.types_json), abilities: JSON.parse(cached.abilities_json),
        stats: JSON.parse(cached.stats_json), cachedAt: cached.updated_at,
      });
    }

    try {
      const d = await fetchPokemonDetails({ pokeApiBase: config.pokeApiBase, idOrName: id });
      const types = normalizeList(d.types), abilities = normalizeList(d.abilities);
      const stats = Array.isArray(d.stats) ? d.stats : [];

      db.prepare(`
        INSERT INTO pokemon_details (pokemon_id, types_json, abilities_json, stats_json, updated_at)
        VALUES (?, ?, ?, ?, datetime('now')) ON CONFLICT(pokemon_id) DO UPDATE SET
        types_json=excluded.types_json, abilities_json=excluded.abilities_json, stats_json=excluded.stats_json, updated_at=datetime('now')
      `).run(id, JSON.stringify(types), JSON.stringify(abilities), JSON.stringify(stats));

      res.json({ id, types, abilities, stats, cachedAt: new Date().toISOString() });
    } catch (err) {
      res.status(502).json({ error: "pokeapi_failed", message: String(err?.message || err) });
    }
  });

  return router;
}


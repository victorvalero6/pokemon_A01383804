import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { openDb, getDbInfo } from "./db.js";
import { seedPokemonIfEmpty } from "./seed.js";
import { pokemonRouter } from "./routes/pokemon.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../public");

async function main() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  const db = openDb(config.dbPath);
  const info = getDbInfo(db);
  console.log(`[db] ${config.dbPath}`);
  console.log(`[db] pokemon_count=${info.pokemonCount}`);

  if (config.seedOnStart) {
    try {
      await seedPokemonIfEmpty({ db, pokeApiBase: config.pokeApiBase });
    } catch (err) {
      console.error(String(err?.stack ?? err));
      console.error("[seed] No se pudo sembrar. La app seguirá corriendo, pero /api/pokemon puede regresar vacío.");
    }
  }

  app.get("/api/health", (_req, res) => {
    const now = new Date().toISOString();
    const { pokemonCount } = getDbInfo(db);
    res.json({ ok: true, now, pokemonCount });
  });

  app.use("/api/pokemon", pokemonRouter(db));

  app.use(express.static(publicDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });

  app.listen(config.port, () => {
    console.log(`[server] http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error(String(err?.stack ?? err));
  process.exitCode = 1;
});


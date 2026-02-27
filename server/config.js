import path from "node:path";

function envBool(name, defaultValue) {
  const raw = process.env[name];
  if (raw == null) return defaultValue;
  return ["1", "true", "yes", "y", "on"].includes(String(raw).toLowerCase());
}

export const config = {
  port: Number(process.env.PORT ?? 5173),
  dbPath: process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.resolve("./server/data/pokemon.sqlite"),
  seedOnStart: envBool("SEED_ON_START", true),
  pokeApiBase: process.env.POKEAPI_BASE ?? "https://pokeapi.co/api/v2",
};


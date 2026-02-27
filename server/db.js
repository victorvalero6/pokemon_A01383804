import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export function openDb(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pokemon (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      image_url TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pokemon_details (
      pokemon_id INTEGER PRIMARY KEY REFERENCES pokemon(id) ON DELETE CASCADE,
      types_json TEXT NOT NULL,
      abilities_json TEXT NOT NULL,
      stats_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_pokemon_name ON pokemon(name);
  `);
}

export function getDbInfo(db) {
  const row = db.prepare("SELECT COUNT(*) as count FROM pokemon").get();
  return { pokemonCount: row?.count ?? 0 };
}


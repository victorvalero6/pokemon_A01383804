export async function fetchPokemonDetails({ pokeApiBase, idOrName }) {
  const res = await fetch(`${pokeApiBase}/pokemon/${encodeURIComponent(String(idOrName))}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PokeAPI ${res.status}: ${text || res.statusText}`);
  }
  const data = await res.json();

  const id = Number(data?.id);
  const name = String(data?.name ?? "");
  const types = Array.isArray(data?.types)
    ? data.types
        .map((t) => t?.type?.name)
        .filter(Boolean)
        .map(String)
    : [];
  const abilities = Array.isArray(data?.abilities)
    ? data.abilities
        .map((a) => a?.ability?.name)
        .filter(Boolean)
        .map(String)
    : [];
  const stats = Array.isArray(data?.stats)
    ? data.stats
        .map((s) => ({
          name: String(s?.stat?.name ?? ""),
          base: Number(s?.base_stat ?? 0),
        }))
        .filter((s) => s.name)
    : [];

  return { id, name, types, abilities, stats };
}


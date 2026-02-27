## Pokédex (frontend + backend + SQLite)

App web que **despliega todos los Pokémon** (nombre + imagen) desde un **API propio** (`/api/pokemon`) y guarda los datos en **SQLite** (listo para sustituir por otra base de datos).

### Requisitos

- Node.js 18+ (recomendado 20+)

### Correr en local

```bash
cd /Users/victorvalero/Desktop/pokemon
npm install
npm run dev
```

Luego abre `http://localhost:5173`.

### Qué hace

- **Seed automático** al arrancar (si la tabla está vacía):
  - Descarga la lista completa desde PokeAPI.
  - Calcula el `id` desde el `url` y guarda `name` + `image_url` (official artwork).
- **Endpoint**:
  - `GET /api/pokemon?offset=0&limit=60&search=pika`
- **Frontend**:
  - Grid con imágenes, búsqueda y scroll infinito.

### Configuración (BD / puerto)

Copia el ejemplo y ajusta variables:

```bash
cp .env.example .env
```

Variables:
- **PORT**: puerto del servidor (default `5173`)
- **DB_PATH**: ruta al archivo SQLite
- **SEED_ON_START**: `true/false`

### Preparado para “conectar a base de datos”

Hoy se usa **SQLite** para que ya tengas el flujo completo (API → BD → UI). Para migrar a Postgres/MySQL normalmente cambias:

- `server/db.js`: reemplazar por un cliente SQL (por ejemplo `pg`) y mantener el mismo contrato de consultas
- `server/routes/pokemon.js`: ya está desacoplado (solo necesita “listar” y “contar”)


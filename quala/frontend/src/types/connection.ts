// Debe coincidir exactamente con los modelos Pydantic del backend.
// No renombrar campos.

export type ConnectionStatus = "untested" | "success" | "error";

// Migracion de PAT a OAuth M2M (Service Principal): host + client_id +
// client_secret ya autentican contra el workspace y permiten listar
// programaticamente cualquier recurso (warehouses, catalogos, jobs,
// pipelines), asi que `http_path`/`warehouse_id` dejan de pedirse al
// crear la conexion. `warehouse_id` se resuelve on the fly (ver
// WarehousePicker) la primera vez que un nodo necesita ejecutar SQL.
export interface DatabricksConnection {
  id: string;
  name: string;
  host: string;
  client_id: string;
  client_secret: string; // nunca se muestra en claro tras guardar
  catalog?: string;
  schema?: string;
  warehouse_id?: string; // resuelto on the fly, no se pide en el alta
  status: ConnectionStatus;
  last_tested_at?: string;
  // --- Campos legacy (PAT + http_path fijo) --------------------------
  // Solo presentes en conexiones creadas ANTES de esta migracion. Si
  // `token` esta presente, la conexion necesita migrarse a OAuth M2M (ver
  // `needsOAuthMigration` en lib/format.ts) -- se mantienen aqui (en vez
  // de borrarlos) unicamente para poder detectar y precargar el flujo de
  // migracion en /connections.
  token?: string;
  http_path?: string;
}

// Resultado simulado de `w.warehouses.list()` / GET /api/2.0/sql/warehouses
// -- usado por WarehousePicker para resolver `warehouse_id` on the fly.
export interface SqlWarehouse {
  id: string;
  name: string;
  size: string;
  state: "running" | "stopped";
}

/** Enmascara un host tipo adb-xxxx.azuredatabricks.net -> adb-...net. */
export function maskHost(host: string): string {
  if (host.length <= 10) return host;
  return `${host.slice(0, 4)}...${host.slice(-8)}`;
}

/** Enmascara un client_id tipo Service Principal (UUID) -> 8f3a1c2b...e91d. */
export function maskClientId(clientId: string): string {
  if (clientId.length <= 12) return clientId;
  return `${clientId.slice(0, 8)}...${clientId.slice(-4)}`;
}

/**
 * Una conexion "necesita migrarse" a OAuth M2M si fue creada con el
 * modelo antiguo (PAT + http_path fijo) y todavia no tiene client_id (ver
 * seccion 1.3 del refactor de autenticacion).
 */
export function needsOAuthMigration(connection: {
  client_id?: string;
  token?: string;
  http_path?: string;
}): boolean {
  return Boolean((connection.token || connection.http_path) && !connection.client_id);
}

/**
 * Alias visible de una fuente conectada (a Validacion, Pipeline o
 * Sintetico -- mismo helper reusado en los tres, nunca reimplementado por
 * separado). Corrige el bug de alias inventados tipo "datos"/"datos_2"
 * (que salian de tomar la ULTIMA PALABRA DEL LABEL DEL NODO, ej. "Fuente
 * de datos" -> "datos"): ahora se deriva siempre del ULTIMO SEGMENTO DEL
 * NOMBRE REAL DE TABLA (ej. "main.sales.order_items" -> "order_items"),
 * que es lo que el usuario realmente reconoce. Si el nodo origen todavia
 * no resuelve ninguna tabla, se usa "Fuente sin configurar" en vez de un
 * nombre inventado. Si dos o mas fuentes conectadas comparten el mismo
 * ultimo segmento, se antepone el penultimo para desambiguar (ej.
 * "sales.order_items" vs "analytics.order_items"). `custom_alias` (solo
 * presente si el usuario renombro la fuente a mano via el boton
 * "Renombrar") tiene siempre prioridad y nunca se recalcula.
 */
export function resolveSourceAlias(
  source: { node_id: string; resolved_table?: string; custom_alias?: string },
  allSources: { node_id: string; resolved_table?: string }[],
): string {
  if (source.custom_alias) return source.custom_alias;
  if (!source.resolved_table) return "Fuente sin configurar";

  const segments = source.resolved_table.split(".");
  const shortName = segments[segments.length - 1] ?? source.resolved_table;
  const collision = allSources.some(
    (s) =>
      s.node_id !== source.node_id &&
      s.resolved_table &&
      s.resolved_table.split(".").pop() === shortName,
  );
  return collision && segments.length >= 2
    ? `${segments[segments.length - 2]}.${shortName}`
    : shortName;
}

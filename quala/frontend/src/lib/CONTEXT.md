# Contexto: src/lib

## Cambios (2026-07-08): selección catálogo/esquema/tabla
- `api.ts` + `mock-api.ts`: nuevas `fetchCatalogs(connId)` y
  `fetchSchemas(connId, catalog)`; `fetchTables` cambió de firma a
  `(connId, catalog, schema)`. `connection-schema.ts` (zod) ya no incluye
  `catalog`/`schema` (la conexión solo pide name/host/client_id/client_secret).
- Hooks (`hooks/use-tables.ts`): nuevos `useCatalogs` y `useSchemas`;
  `useTables(connId, catalog, schema)` (antes solo `connId`). Consumidos por
  el selector en cascada de `components/graph/table-explorer.tsx`.

## Cambios en esta sesión (puente front↔back)
2026-07-06 — Se conectó el frontend al backend real (FastAPI, ver
`quala/backend/api/`). Nuevos/mod:
- `api.ts` (NUEVO): cliente `fetch` real contra `VITE_API_BASE_URL`, con las
  MISMAS firmas que `mock-api.ts`. Implementa el slice de Validación +
  conexiones + proyectos + grafo + metastore. Las funciones de slices aún no
  montados en el backend (jobs, lakeflow, pipeline/generación sintética,
  historial) lanzan un error explícito `notImplemented`.
- `api-client.ts` (NUEVO): selector `export const api = useMock ? mock : real`
  según `VITE_USE_MOCK_API` (por defecto mock; `=false` usa el backend). Como
  ambos módulos exponen las mismas firmas, TypeScript verifica que no diverjan.
  Todos los hooks (`src/hooks/*`) ahora importan `{ api }` desde aquí en vez
  de `* as api from "@/lib/mock-api"` (excepto `project-card.tsx`, que sigue
  usando `getGraphSummarySync` del mock directamente).
- `mock-api.ts`: se ampliaron 5 firmas para que coincidan con `api.ts` (params
  opcionales que el mock ignora): `fetchTableSchema`, `validateTableExists`,
  `fetchTablePreviewRows`, `suggestBusinessRules` (todas + `connectionId?`) y
  `runValidation` (+ `opts?: { connectionId, warehouseId }`). El backend real
  necesita saber contra qué workspace ejecutar; el `connectionId` se threadea
  desde los paneles (que ya lo reciben) hasta estos hooks.

Verificado: `tsc --noEmit` limpio. El modo mock sigue siendo el
comportamiento por defecto y no cambió. QA en navegador contra el backend
real (`VITE_USE_MOCK_API=false`) pendiente (requiere Databricks vivo).

## Última actualización
2026-07-06

## Qué vive aquí
Helpers puros compartidos por toda la app: formateo/derivación de datos (`format.ts`), reglas de compatibilidad del grafo (`graph-rules.ts`), validaciones de conexión (`graph-validation.ts`), mock API (`mock-api.ts`), cliente de TanStack Query (`query-client.ts`), utilidades genéricas (`utils.ts`) y schemas de validación (`schemas/`).

## Estado actual
- `format.ts` exporta `resolveSourceAlias(source, allSources): string` — el único punto donde se deriva el alias visible de una fuente conectada. Reemplaza por completo a `defaultSourceAlias` (ya no existe en el código). Lógica: usa `custom_alias` si existe; si no hay `resolved_table`, devuelve `"Fuente sin configurar"`; si no, toma el último segmento del nombre de tabla (`main.sales.order_items` → `order_items`), y si otra fuente del mismo `allSources` comparte ese último segmento, antepone el penúltimo segmento para desambiguar.
- `graph-rules.ts`: `COMPATIBILITY.synthetic_generator` cambió de `[]` a `["data_source"]` — el nodo Generador sintético ahora acepta una arista entrante desde un nodo Fuente de datos (antes no aceptaba ninguna entrada).
- `graph-validation.ts`, `mock-api.ts`, `query-client.ts`, `utils.ts`, `schemas/`: sin cambios en esta sesión.

## Decisiones de diseño tomadas
- El alias de una fuente conectada se calcula siempre a partir de la tabla real, nunca del label del nodo — corrige el bug histórico de alias inventados ("datos"/"datos_2").
- Alcance del esquema de referencia del nodo Sintético restringido solo a `data_source` (no `pipeline`/`validation`), siguiendo la redacción literal de la especificación entregada. Esta decisión de alcance no fue confirmada explícitamente por el usuario como definitiva — ver Pendiente.

## Pendiente de implementar
1. Confirmar con el usuario si `COMPATIBILITY.synthetic_generator` debe ampliarse a `["data_source", "pipeline", "validation"]`. Si se confirma, este es el único lugar a editar; el resto del flujo (lectura de esquema, `PipelineInputSourcesList`) ya es agnóstico al tipo de nodo origen.

## Bugs conocidos / deuda técnica
Ninguno conocido en este directorio.

## Dependencias con otros directorios
`resolveSourceAlias` es consumido por `src/components/graph/connected-sources-list.tsx`, `src/components/graph/pipeline-input-sources-list.tsx`, los 4 paneles en `src/components/graph/panels/`, y `src/pages/project-canvas-page.tsx` (cálculo de `validationSources` en `getIncomingSources`). `graph-rules.ts` es consumido por la lógica de `isValidConnection` del canvas.

## Para el siguiente agente
Cualquier cambio al criterio de qué tipos de nodo puede conectarse a cuáles empieza y termina en `graph-rules.ts` (`COMPATIBILITY`). Cualquier cambio a cómo se ve un alias empieza y termina en `format.ts` (`resolveSourceAlias`). No dupliques esta lógica en un panel.

# Contexto: src/types

## Cambios (2026-07-08b): multi-tabla + contexto de validación
- `DataSourceConfig` ganó `tables?: string[]` (nodo multi-tabla; `table` queda
  como la representativa = `tables[0]`). Ver `components/graph/CONTEXT.md`.
- `ValidationConfig` ganó `context_prompt?: string` (texto libre de contexto de
  datos que se envía a la IA). `GenerateSqlRulesRequest` (validation.ts) ganó
  `context?: string`, espejo de `schemas.py` en el backend.

## Cambios en esta sesión (backend + contrato)
2026-07-06 — Se arrancó el backend HTTP real (`quala/backend/api/`, FastAPI,
slice de Validación). Al alinear el contrato con los modelos Pydantic del
backend se corrigió una divergencia en `generation-plan.ts`: el enum
`GeneratorType` listaba 13 generadores y le faltaba `parent_field_ref` (el
backend tiene 14, ver `synthetic_generation/registry.py`). Añadido. El resto
de `types/*.ts` ya coincidía con `quala/backend/api/schemas.py` (espejo 1:1).
Pendiente relacionado: el puente `src/lib/api.ts` (cliente fetch real) aún no
existe; los hooks siguen sobre `mock-api`. Ver
`quala/backend/api/CONTEXT.md` (sección "Pendiente de implementar").

## Última actualización
2026-07-06

## Qué vive aquí
Interfaces TypeScript del modelo de datos de Quala: grafo de proyecto (nodos/aristas), configuración por tipo de nodo, resultados de ejecución, y tipos de validación/generación/conexión Databricks. `graph.ts` es el fichero central para todo lo tocado en esta sesión.

## Estado actual
- `QualaNodeType`/`QualaNodeStatus`: sin cambios en esta sesión.
- `PipelineConfig`: ya NO tiene `input_mode`/`embedded_table`/`embedded_synthetic_plan`/`embedded_synthetic_result` (la entrada embebida se eliminó por completo). Tiene `connected_sources: ConnectedSource[]` (reflejo de las aristas de entrada) y `active_input_source_id: string | null` (qué fuente conectada resuelve los parámetros "Desde entrada resultante" cuando hay 2 o más fuentes).
- `SyntheticGeneratorConfig`: ganó `reference_sources: ConnectedSource[]` (esquema de referencia opcional, poblado solo desde nodos `data_source` conectados).
- `ConnectedSource`: el campo `alias: string` (obligatorio, autogenerado) se reemplazó por `custom_alias?: string` (opcional, solo existe si el usuario renombró la fuente a mano con el botón "Renombrar"). El alias visible SIEMPRE se calcula en tiempo de render con `resolveSourceAlias` (ver `src/lib/CONTEXT.md`); ningún componente debe leer `custom_alias` directamente para mostrarlo.
- `ConnectedSource` es un único tipo reutilizado por `PipelineConfig.connected_sources`, `ValidationConfig.connected_sources` y `SyntheticGeneratorConfig.reference_sources`.

## Decisiones de diseño tomadas
- Un único tipo `ConnectedSource` para las 3 relaciones "fuente conectada a la entrada de un nodo" (Validación, Pipeline, Sintético) en vez de 3 tipos casi idénticos — evita divergencia futura entre paneles.
- El alias se calcula, nunca se almacena: corrige el bug de alias inventados ("datos", "datos_2") que salían de derivar el alias del label del nodo en vez de la tabla real.

## Pendiente de implementar
Nada pendiente conocido en este directorio — todos los cambios de tipo discutidos en esta sesión están aplicados.

## Bugs conocidos / deuda técnica
Ninguno conocido en este directorio.

## Dependencias con otros directorios
- `src/lib/format.ts` (`resolveSourceAlias`) es el único lugar que debe leer `ConnectedSource.custom_alias`/`resolved_table` para producir el alias visible.
- `src/components/graph/panels/*` y `src/pages/project-canvas-page.tsx` construyen y sincronizan `connected_sources`/`reference_sources` a partir de las aristas del canvas.

## Para el siguiente agente
Si vas a añadir un nuevo tipo de nodo con entrada por arista, reutiliza `ConnectedSource` en vez de crear un tipo nuevo. Si necesitas cambiar cómo se calcula el alias visible, el único sitio a tocar es `resolveSourceAlias` en `src/lib/format.ts`.

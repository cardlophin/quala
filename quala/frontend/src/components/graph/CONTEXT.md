# Contexto: src/components/graph (nivel superior)

## Cambios (2026-07-10b): tablas expuestas a través de nodos intermedios
Bug: un origen multi-tabla (clientes, pedidos) conectado a un Pipeline a través
de un nodo Validación solo exponía su PRIMERA tabla (se perdía `pedidos`).
Nuevo `resolveExposedTables` (en `project-canvas-page.tsx`): calcula TODAS las
tablas que un nodo expone — data_source multi-tabla → sus N tablas; Validación
es PASS-THROUGH y expone (recursivo) las tablas de sus entradas; sintético/
pipeline → su(s) tabla(s) de salida (`written_tables`/`output_table`).
`getIncomingSources` ahora expande cada origen en una fuente por tabla expuesta,
así el Pipeline ve clientes + pedidos + clientes_scoring. `tsc` limpio.

## Cambios (2026-07-10): parámetro por fuente (pipeline multi-entrada)
`PipelineParameterMapping` ganó `input_source_id?`. Antes, todos los parámetros
"resolved_input" resolvían a la ÚNICA entrada activa (bug: con varias fuentes
conectadas, source_table/pedidos_table/scoring_table apuntaban a la misma
tabla). Ahora, cuando hay >1 fuente conectada, el editor de parámetros
(`pipeline-resource-picker.tsx`) muestra un Select por parámetro para elegir a
qué fuente conectada apunta; `pipeline-panel.tsx` resuelve cada uno con
`resolveInputTable(input_source_id)` (o la entrada activa por defecto).
Además, al seleccionar el recurso (`selectResource`), los parámetros de tabla
se AUTO-MAPEAN a las fuentes conectadas emparejando por nombre
(`bestSourceForParam`: "pedidos_table"→fuente "pedidos", "scoring_table"→
"clientes_scoring", etc.), la salida (`result_table`/`output`) a
"resolved_output", y el resto a valor fijo. Así los nodos de entrada "se
transfieren" solos al pipeline en vez de quedar en valor fijo. (Requiere tener
las fuentes conectadas ANTES de elegir el job; re-seleccionar el job re-mapea.)
`tsc --noEmit` limpio.

## Cambios (2026-07-09c): topología datos → pipeline → datos
- `graph-rules.ts`: `COMPATIBILITY.data_source` pasó de `[]` a `["pipeline"]`:
  un nodo Fuente de datos puede ser ORIGEN o DESTINO/salida de un pipeline. El
  nodo (`nodes/data-source-node.tsx`) ganó `hasInput`.
- La **salida del pipeline se define en la topología**: `node-actions-context`
  expone `getOutputTable(nodeId)` (implementado en `project-canvas-page.tsx`),
  que devuelve la tabla del nodo Fuente de datos conectado a la SALIDA del
  pipeline. `PipelineParameterMapping.source` ganó `"resolved_output"`.
- `pipeline-resource-picker.tsx`: nuevo origen de parámetro "Desde salida
  (nodo)" que resuelve a `outputTable`; auto-mapea parámetros cuyo nombre
  parece de salida (`OUTPUT_PARAM_RE`: output/target/salida/destino/sink). El
  panel pasa `outputTable` y lo usa al construir los `params` del run.
- Flujo completo: datos → pipeline → datos → validación (la validación cuelga
  del nodo de datos de salida). `tsc --noEmit` limpio.
- **Autocompletado del nodo de salida**: `node-actions-context.setOutputTable`
  (impl. en `project-canvas-page.tsx`) rellena la tabla del nodo Fuente de datos
  de salida (o CREA uno conectado si no existe). El panel lo llama al
  seleccionar el recurso (default del parámetro de salida) y tras un run con
  éxito (tabla producida). Así la salida no se define a mano.

## Cambios (2026-07-09): editable + volcado a Databricks + drop `__`
- **Volcar a Databricks** (`synthetic-generator-panel.tsx`, tab "Datos
  generados"): selector de catálogo (`useCatalogs`) + input de esquema (nuevo o
  existente) + botón `useWriteSynthetic` → `POST /synthetic/write`. Al volcar,
  el `result.output_table` del nodo pasa al nombre completo real escrito, para
  poder engancharlo a un Pipeline/Validación aguas abajo. `api.ts`/`mock-api.ts`
  exponen `writeSyntheticToDatabricks`.
- Los campos puente `__` ya no aparecen en el preview de datos (el backend los
  dropea en `run_plan`).

## Cambios (2026-07-08e): generación sintética conectada + fixes visuales
- **Generación sintética real**: `synthetic-generator-panel.tsx` ahora llama al
  backend (`/synthetic/plan` y `/synthetic/run`). `generatePlan` acepta un
  `schemaContext` (tipo `SchemaContextSource` en graph.ts) construido desde las
  Fuentes de datos conectadas (columnas + PK/FK, nunca datos) para dar contexto
  al LLM. `GenerationRunResult` ganó `tables[]`/`row_counts`/`is_valid` y el tab
  "Datos generados" renderiza TODAS las tablas del plan. Toasts al generar
  plan/datos. `api.ts`/`mock-api.ts` implementan `generatePlan`/`runGeneration`;
  hook `useGeneratePlan` recibe `{description, schemaContext}`.
- **Vista amigable editable**: en el tab "Esquema" del generador, el nº de filas
  por tabla (`row_count`) y la semilla (`runner.seed`) son editables (inputs); al
  cambiarlos se reemplaza el plan en la config del nodo y "Generar datos" usa el
  plan editado. Se listan también los campos de cada tabla (solo lectura).
- **Fixes visuales validación**: sugerencias de reglas pasaron de chips
  `rounded-full` a lista `rounded-lg` con texto que envuelve (no desborda);
  acordeón de reglas SQL con truncado robusto + `break-words`; nueva cabecera
  "Reglas SQL generadas" con icono (FileCode2) y contador.
`tsc --noEmit` limpio; motor sintético verificado en sandbox.

## Cambios (2026-07-08d): reglas desplegables + IA + toast + tabs
- **Reglas SQL desplegables** (`sql-rules-table.tsx`): pasó de tabla a acordeón
  (cabecera = regla truncada + badges; contenido = regla completa + SQL editable)
  para no romper la armonía visual cuando la regla en lenguaje natural es larga.
- **Sugerencias de reglas con IA** (`suggested-rules-panel.tsx`): ya no es una
  heurística automática; ahora un botón "Sugerir reglas con IA" dispara una
  mutación (`useSuggestRulesAi`) que envía el ESQUEMA (columnas + PK/FK, nunca
  los datos) al backend, donde Gemini propone reglas. El `validation-panel`
  construye `sourcesForSuggestions` con columnas desde `schemaQueries`.
- **Toast al ejecutar validación** (`validation-panel.tsx`): `sonner` avisa
  éxito / incumplimientos / error al terminar `runValidation`.
- **Pestañas redondeadas** (`node-config-dialog.tsx`): la barra Origen/Reglas/
  Resultados pasó de subrayado cuadrado a control segmentado `rounded-xl`.
`tsc --noEmit` limpio.

## Cambios (2026-07-08c): visor ER + redondeo del item seleccionado
- **Visor de esquema relacional** (`schema-diagram.tsx`, NUEVO): diagrama ER
  estilo ChartDB con ReactFlow (nodo-tabla con columnas + marcas PK/FK, aristas
  hija→padre inferidas por FK/PK o por nombre `*_id`). Se muestra en la pestaña
  "Esquema y datos" del panel Fuente de datos cuando el nodo tiene >1 tabla.
  Read-only pero arrastrable; usa su propio `ReactFlowProvider`.
- Backend: `get_table_schema` ahora rellena `is_primary_key`/`is_foreign_key`
  best-effort desde `information_schema.table_constraints`+`key_column_usage`
  (si falla o no hay constraints, sin marcas — no rompe el esquema).
- **Item seleccionado redondeado**: `ui/command.tsx` — `CommandItem` pasó de
  `rounded-sm` a `rounded-lg` y el `Command` a `rounded-xl`, para no chocar con
  los selectores `rounded-xl`.
`tsc --noEmit` limpio.

## Cambios (2026-07-08b): UX de selección + multi-tabla + contexto
- **Fuente de datos multi-tabla**: `DataSourceConfig` ganó `tables?: string[]`.
  El panel (`panels/data-source-panel.tsx`) tiene un toggle "Una tabla / Varias
  tablas"; en modo varias, `table-explorer.tsx` muestra un checklist de las
  tablas del esquema (con "seleccionar todas"). El nodo (`nodes/data-source-node.tsx`)
  se marca especial cuando hay >1 tabla (icono Layers + badge "N tablas" +
  lista). En el canvas, `getIncomingSources` EXPANDE un nodo multi-tabla en una
  fuente conectada por tabla (node_id compuesto `"<id>::<tabla>"`), reutilizando
  el soporte multi-entrada del nodo Validación. `resolveNodeOutputTable` de un
  data_source devuelve `table ?? tables[0]`.
- **Indicadores de carga**: `table-explorer.tsx` muestra un punto de estado
  junto a Catálogo/Esquema/Tabla — ámbar (pulsando) mientras consulta
  Databricks, verde cuando cargó.
- **Selectores redondeados**: `table-picker.tsx` usa `rounded-xl` en trigger y
  popover.
- **Contexto en Validación**: `ValidationConfig.context_prompt`; textarea en el
  panel de Validación (pestaña Reglas) que se envía como `context` en
  `generateSqlRules` (el backend lo inyecta en el prompt de Gemini).
`tsc --noEmit` limpio.

## Cambios (2026-07-08): selección de tabla en cascada
`table-explorer.tsx` ya no muestra una lista plana de todas las tablas de la
conexión (que dependía de un catálogo fijado en la conexión). Ahora, tras el
gate de warehouse (`WarehousePicker`), ofrece tres selectores en cascada
catálogo → esquema → tabla contra el workspace real (hooks `useCatalogs`/
`useSchemas`/`useTables(catalog, schema)`). `table-picker.tsx` se generalizó a
un selector de string reutilizable (props nuevas `searchPlaceholder`,
`emptyLabel`, `disabled`, `icon`) y se usa para los tres niveles. El
formulario de conexión (`components/shared/connection-form.tsx`) dejó de pedir
catalog/schema. `tsc --noEmit` limpio.

## Última actualización
2026-07-06

## Qué vive aquí
Componentes compartidos del canvas de grafo que no son ni un nodo (`nodes/`) ni un panel de configuración (`panels/`): el shell de diálogo (`node-config-dialog.tsx`), las listas de fuentes conectadas, el contexto de acciones de nodo, el selector de recursos de Pipeline, y componentes de apoyo (badges, editores de reglas, previews de esquema, etc.).

## Estado actual
- **`node-config-dialog.tsx`** (nuevo, reemplaza a `node-config-sheet.tsx`): shell compartido Dialog + Tabs. Modal centrado de ancho fijo (~720px), `h-[85vh] max-h-[720px]`. Estructura fija: cabecera (icono + nombre editable inline + `StatusBadge` + botón cerrar, con espaciado explícito `ml-2`/`ml-3` entre badge y botón), barra de pestañas con estilo subrayado (no el pill-style por defecto de `ui/tabs.tsx`, sobreescrito vía `cn()`), contenido con scroll (única zona que scrollea), barra de acción fija opcional al fondo (`shrink-0 border-t bg-muted/30`). Usa `TabsContent forceMount` + clase `hidden` condicional en vez de desmontar pestañas inactivas, así el estado local de cada pestaña sobrevive al cambiar de tab. No acepta prop `children` — cualquier UI flotante adicional (ej. `SourceMetadataSheet` en Validación) debe renderizarse como hermano en un Fragment, no anidado dentro del Dialog.
- **`connected-sources-list.tsx`**: reescrito para usar `resolveSourceAlias` (de `src/lib/format.ts`) en vez de un alias almacenado; el alias se muestra como texto estático (no un `Input` siempre editable), con botón "Renombrar" visible solo al hacer hover, que abre edición inline local (`editingId`/`draft`).
- **`pipeline-input-sources-list.tsx`**: mismo patrón de alias que `connected-sources-list.tsx` (prop opcional `onAliasChange`). Además soporta selección de "fuente activa" vía radio button (props opcionales `activeSourceId`/`onSelectActive`, solo se muestran cuando `sources.length >= 2`). Se reutiliza tal cual en Pipeline ("Entrada") y en Sintético ("Configuración" → esquema de referencia) — no se creó un componente nuevo para Sintético.
- **`pipeline-resource-picker.tsx`**: dividido vía prop `section: "config" | "parameters"`, comparte los hooks `useJobs`/`useLakeflowPipelines` internamente para poder montarse una vez por pestaña de Pipeline sin duplicar lógica de carga.
- **`status-badge.tsx`**: badge unificado (borde + icono/punto en vez de relleno sólido) que agrupa los 6 `QualaNodeStatus` en 3 familias visuales (pendiente/configurando/corriendo = ámbar con punto pulsante; listo/completado = verde con check; error = rojo con X).
- **Archivos eliminados esta sesión**: `node-config-sheet.tsx` (reemplazado por `node-config-dialog.tsx`).
- **Sin cambios esta sesión**: `node-actions-context.tsx` (ya tenía `status`/`validationSources` de una tarea anterior a esta conversación visible), `business-rules-editor.tsx`, `business-rules-library-sheet.tsx`, `compare-sheet.tsx`, `node-shell.tsx`, `pipeline-logs-stream.tsx`, `rule-chip.tsx`, `rule-detail-sheet.tsx`, `schema-preview.tsx`, `source-metadata-sheet.tsx`, `sql-rules-table.tsx`, `suggested-rules-panel.tsx`, `table-explorer.tsx`, `table-picker.tsx`, `validation-feedback-view.tsx`.

## Decisiones de diseño tomadas
- `NodeConfigDialog` no acepta `children` a propósito, para forzar que cada panel declare explícitamente sus pestañas/barra de acción en vez de mezclar contenido libre con contenido estructurado.
- `PipelineInputSourcesList` se reutiliza verbatim entre Pipeline y Sintético en vez de crear un componente nuevo — ambos necesitan la misma fila (icono + alias + estado + opcional radio/renombrar).

## Pendiente de implementar
Nada pendiente conocido en este directorio.

## Bugs conocidos / deuda técnica
`pipeline-input-resolver.tsx` — código muerto de una iteración anterior, neutralizado con `export {}`. Puede reaparecer como stub vacío en el repositorio real tras sincronizar desde un directorio de trabajo temporal (limitación de mount de solo-adición del entorno del agente). Si reaparece, basta con borrarlo de nuevo; no requiere revisión de código.

## Dependencias con otros directorios
Consumido por los 4 paneles en `../panels/`. Depende de `src/lib/format.ts` (`resolveSourceAlias`) y `src/types/graph.ts` (`ConnectedSource`).

## Para el siguiente agente
Si vas a tocar la cabecera, pestañas o barra de acción de CUALQUIER panel, el cambio probablemente empieza en `node-config-dialog.tsx`, no en el panel individual. Si vas a tocar cómo se muestra o renombra una fuente conectada, el cambio empieza en `connected-sources-list.tsx` o `pipeline-input-sources-list.tsx` (según el nodo), reutilizando siempre `resolveSourceAlias`.

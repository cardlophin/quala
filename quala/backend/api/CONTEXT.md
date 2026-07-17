# Contexto: quala/backend/api (capa HTTP FastAPI)

## Cambios (2026-07-10d): inyección de params en Lakeflow Pipelines robusta
`run_pipeline` (rama pipeline) reescribió la aplicación de params: antes
reconstruía el spec por campos sueltos con `pipelines.update(...)` y fallaba en
silencio ("no se pudieron aplicar los parámetros"). Ahora reenvía el spec
COMPLETO (`spec.as_dict()`) por la API cruda (`PUT /api/2.0/pipelines/{id}`),
solo si algún valor DIFIERE de la config actual (si el usuario ya los dejó como
default, no toca nada y no avisa), y ante fallo muestra el error real en logs.
No verificable en sandbox (Databricks bloqueado).

## Cambios (2026-07-10c): saneado de fórmulas inválidas
El motor evalúa `formula`/`formula_match` con `SafeExpressionEvaluator`
(`ast.parse(mode="eval")`); si el LLM escribe SQL (`CASE WHEN ...`) o una
expresión malformada, `run_plan` reventaba con "Invalid expression syntax".
Nuevo `_sanitize_formulas` (llamado en `generate_plan` y en `_execute_plan`,
así también repara planes ya guardados en el nodo): valida cada expresión y, si
no parsea, sustituye el generador `formula` por uno seguro según `logical_type`
(numeric_range/date_range/faker) y elimina los `formula_match` inválidos.
Verificado con un `CASE WHEN`: se neutraliza y el plan ejecuta.

## Cambios (2026-07-10b): esquema de referencia = solo esas tablas (garantía dura)
Contrato: si el nodo sintético tiene esquema de referencia conectado, se generan
EXACTAMENTE esas tablas y ninguna más (aunque la descripción mencione FKs a otras
tablas). Dos capas:
1. Prompt (`_build_user_content`): instruye a generar SOLO las tablas de
   referencia y a resolver FKs con generadores autónomos (sin crear tabla padre).
2. **Estructural** (`_restrict_plan_to_reference`, llamado en `generate_plan`
   tras `apply_repairs`): recorta el plan a las tablas de referencia, y en las
   tablas que se conservan neutraliza los generadores/constraints que apuntaban a
   tablas eliminadas (`foreign_key`→`uuid`, `parent_field_ref`→date/numeric/faker
   según `as_type`, quita `foreign_key_exists` colgantes), y ajusta
   `execution_order`/`depends_on`/`edge_cases`. Verificado: el plan recortado
   sigue parseando y ejecutando en el motor.
Motivo del bug: al referenciar `clientes_scoring` con una descripción que pedía
FK a `clientes`, el LLM creaba una tabla `clientes` padre. Ahora se elimina.
Si el LLM nombra las tablas distinto (no casa ninguna con la referencia), no se
recorta (mejor datos que plan vacío).

## Cambios (2026-07-10): validación de la generación expuesta
`run_plan` ahora devuelve también `validation` (is_valid + issues del
`validation_report` del motor: constraints que cumple/incumple el dataset
válido), `edge_cases_generated` (nombres de los edge cases mutados) e
`invalid_tables` (preview del dataset INVÁLIDO generado a propósito, sin `__`).
El frontend lo muestra en el panel sintético (tarjeta "Validación de la
generación" + badges de casos límite + acordeón con las filas inválidas).

## Cambios (2026-07-09b): slice de Pipeline (jobs/lakeflow/run)
Nuevo `routers/pipeline.py` + funciones en `services/databricks.py`:
- `GET /connections/{id}/jobs` → jobs con sus Job Parameters.
- `GET /connections/{id}/lakeflow-pipelines` → pipelines DLT con su `configuration`
  (+ heurística de clave de entrada).
- `POST /connections/{id}/resources/verify` → existe el job/pipeline.
- `POST /pipeline/run` → Job: `run_now(job_parameters=...)` + espera; Pipeline:
  merge de `configuration` (best-effort, patrón de b.py) + `start_update` + polling.
  Devuelve el mensaje LITERAL de Databricks. Los `params` (entrada/salida/otros
  definidos con dbutils) se resuelven en el frontend desde `parameter_mappings`.
  IMPORTANTE (fix): `list_jobs` pide cada job completo con `jobs.get(job_id)`
  porque `jobs.list()` devuelve un `settings` RESUMIDO sin los Job Parameters
  (si no, el panel mostraba "no declara parámetros configurables").
Frontend: `api.ts` implementa fetchJobs/fetchLakeflowPipelines/validateResourceExists
(+connectionId)/runPipeline (+params,+connectionId); ya no hay `notImplemented`
para Pipeline. Con esto queda pendiente solo `/history`.

## Cambios (2026-07-09): drop de campos puente + volcado a Databricks
- `run_plan` (services/synthetic.py) ahora dropea los campos PUENTE con prefijo
  `__` (ej. `__shipped_date_full`) del preview: ayudan a resolver dependencias
  durante la generación pero NO forman parte del dataset final. (El motor solo
  quita las claves internas `__linked__`/`__fk_row__`, no estos helpers.)
- Nuevo `POST /synthetic/write` + `synthetic.write_to_databricks`: ejecuta el
  plan completo y escribe todas las tablas en `catalog.schema` de Databricks
  (`CREATE SCHEMA IF NOT EXISTS` + `CREATE OR REPLACE TABLE` con tipos del plan
  + `INSERT` por lotes de 200), dropeando los `__`. Devuelve
  `{schema, tables:[{name, full_name, row_count}]}`. Verificado localmente el
  SQL generado (sin ejecutar contra Databricks). El frontend, tras volcar,
  actualiza `output_table` del nodo al nombre completo real para que un
  Pipeline/Validación aguas abajo pueda consumirlo.

## Cambios (2026-07-08e): slice de generación sintética
Nuevo `services/synthetic.py` + `routers/synthetic.py`:
- `POST /synthetic/plan` (body `{description, schema_context?}`) → GenerationPlan:
  envuelve `design/rules/generation_planning.py` (Gemini + extracción YAML +
  `apply_repairs`), importado de forma perezosa (añade `design/rules` a
  sys.path). El `schema_context` (columnas + PK/FK de un nodo Fuente de datos
  conectado, NUNCA datos) se inyecta en el prompt del LLM.
- `POST /synthetic/run` (body `{plan}`) → ejecuta el plan con el motor real
  (`synthetic_generation.parser.parse_plan` + `Runner`) y devuelve preview por
  tabla (`preview_rows`, `output_table`, `tables[]`, `row_counts`, `is_valid`).
Verificado en sandbox con el plan de ejemplo (customers=30, orders=150, válido).
El motor (`synthetic_generation`) SÍ corre local sin red; la planificación
(Gemini) requiere `GEMINI_API_KEY`. Con esto, generación sintética queda
conectada extremo a extremo. Pendientes: slice `/pipeline/*` y `/history`.

## Cambios (2026-07-08d): sugerencia de reglas con IA
Nuevo endpoint `POST /validation/suggest-rules-ai` + `rules.suggest_business_rules_ai`:
recibe el ESQUEMA de las tablas (alias/tabla/columnas con marcas PK/FK, nunca
datos) y pide a Gemini reglas de negocio de validación (texto libre, español),
incluida integridad referencial entre tablas relacionadas. Se dispara desde un
botón en el panel de Validación (no automático). `get_table_schema` ya rellena
PK/FK (ver 07-08c), que alimentan tanto el diagrama ER como este prompt.

## Cambios (2026-07-08b): contexto libre en generate-sql
`GenerateSqlRulesRequest` (schemas.py) ganó `context: Optional[str]`.
`services/rules.py` (`generate_sql_rules` + `_build_user_prompt`) lo inyecta en
el prompt de Gemini bajo "Contexto adicional de los datos". El frontend lo
envía desde el textarea del nodo de Validación (`ValidationConfig.context_prompt`).

## Cambios (2026-07-08): navegación catálogo/esquema/tabla
La conexión ya NO fija catálogo ni esquema (antes eran campos opcionales del
alta). Ahora se navegan en la interfaz, ya conectado y con warehouse resuelto.
Nuevo en `services/databricks.py`: `list_catalogs` (`SHOW CATALOGS`),
`list_schemas(catalog)` (`SHOW SCHEMAS IN`), y `list_tables(catalog, schema)`
reescrito a `SHOW TABLES IN <catalog>.<schema>` (antes leía `connection.catalog`
vía information_schema). Nuevos endpoints en `routers/connections.py`:
`GET /connections/{id}/catalogs`, `/schemas?catalog=`, y `/tables?catalog=&schema=`
(este último cambió de firma: ahora exige `catalog` y `schema`). Los campos
`catalog`/`schema` siguen existiendo en el modelo `DatabricksConnection` por
compatibilidad, pero el formulario ya no los envía. Verificado: rutas en
OpenAPI + `py_compile`. Frontend correspondiente: selector en cascada en
`components/graph/table-explorer.tsx` + hooks `useCatalogs`/`useSchemas`/
`useTables(catalog, schema)`.

## Cambios en esta sesión
2026-07-06 — Creación desde cero de la capa HTTP del backend (no existía
ningún `main.py`/FastAPI montado). Primer vertical slice: **Validación sobre
Databricks** (contrato de `frontend/src/lib/mock-api.ts`). Decisiones
tomadas con el usuario: empezar por el slice de Validación, persistencia
**SQLite**, integración con Databricks **real** (OAuth M2M).

Archivos nuevos:
- `main.py` — app FastAPI, CORS al dev server de Vite, `lifespan` que crea
  las tablas, y `sys.path` de `quala/backend` para importar
  `synthetic_generation.*` en slices futuros. Endpoint `/health`.
- `config.py` — `Settings` (dataclass) leído de `.env` de la raíz del repo
  vía `python-dotenv` (no se añadió `pydantic-settings`). Expone host/
  client_id/client_secret de Databricks, `GEMINI_API_KEY`, `MODEL_NAME`,
  ruta SQLite y orígenes CORS.
- `schemas.py` — modelos Pydantic **espejo 1:1** de `frontend/src/types/*.ts`
  (no renombrar campos; `schema` se mapea con alias porque es palabra
  reservada en Python).
- `store.py` — persistencia con `sqlite3` (stdlib, sin deps nuevas). Tablas
  `connections`, `projects`, `project_graphs`; cada fila es JSON. Siembra la
  conexión legacy demo igual que hacía el mock.
- `services/databricks.py` — `WorkspaceClient` OAuth M2M + `run_sql` vía
  `statement_execution` (patrón de `design/integration/databricks/b.py`).
  list_warehouses, resolve_warehouse_id, list_tables, get_table_schema,
  table_exists, preview_rows. Import del SDK perezoso.
- `services/rules.py` — `generate_sql_rules` (reglas de negocio → SQL vía
  **Gemini/google-genai**, sustituye al `rule_generation.py` basado en
  Ollama) + `suggest_business_rules` (heurística de esquema idéntica al
  mock, sin LLM).
- `services/validation.py` — ejecuta un RuleSet contra el warehouse y arma
  `ValidationFeedback` (mismo veredicto por regla que el mock, con datos
  reales + `sample_invalid_rows`).
- `routers/connections.py` — CRUD + `/test` + metastore (warehouses, tables,
  schema, exists, preview).
- `routers/projects.py` — CRUD + grafo (GET/PUT `/projects/{id}/graph`).
- `routers/validation.py` — `/validation/generate-sql`, `/suggest-rules`, `/run`.

Verificado: `py_compile` de todos los módulos + smoke test con
`fastapi.testclient` (15/15 checks: health, seed, CRUD conexiones/proyectos,
grafo por defecto + persistencia, contrato de `ValidationFeedback`, degradado
controlado de generate-sql/run cuando faltan LLM/SDK, OpenAPI con 15 rutas).
La ejecución **real contra Databricks NO se pudo probar en el sandbox** (el
host del workspace está bloqueado por el proxy: `403 Forbidden`); se prueba
en la máquina del usuario.

## Qué vive aquí
La capa HTTP que une el frontend (canvas n8n) con la lógica ya existente del
repo. El contrato es, 1:1, el de `frontend/src/lib/mock-api.ts`: cada función
exportada allí tiene aquí un endpoint equivalente con los mismos campos.

## Cómo arrancar (local, contra Databricks real)
```
cd quala/backend
# usar el venv del repo (Python 3.12+) con las deps de pyproject.toml
uvicorn api.main:app --reload --port 8000
```
Requiere en el `.env` de la raíz: `DATABRICKS_HOST`, `DATABRICKS_CLIENT_ID`,
`DATABRICKS_CLIENT_SECRET`, `GEMINI_API_KEY`, `MODEL_NAME`. Opcional:
`QUALA_DB_PATH`, `QUALA_CORS_ORIGINS`. Docs interactivas en
`http://localhost:8000/docs`.

En el frontend, poner `VITE_USE_MOCK_API=false` y
`VITE_API_BASE_URL=http://localhost:8000` (ver pendiente del puente).

## Mapa endpoint ↔ mock-api.ts
- `/connections*` ↔ fetch/create/update/deleteConnection, testConnection,
  fetchWarehouses, fetchTables, fetchTableSchema, validateTableExists,
  fetchTablePreviewRows.
- `/projects*` ↔ fetch/create/updateProject, fetchProjectGraph,
  saveProjectGraph.
- `/validation/*` ↔ generateSqlRules, suggestBusinessRules, runValidation.

## Decisiones de diseño tomadas
- **El backend es sin estado por nodo.** No recalcula la entrada de un nodo;
  el frontend le manda la tabla ya resuelta desde las aristas (regla "el
  grafo es la fuente de verdad" se respeta también aquí).
- **SQLite con JSON en una columna** en vez de DDL por campo: el shape lo
  definen los modelos Pydantic (fuente de verdad única), no columnas SQL.
- **Gemini en vez de Ollama** para traducir reglas a SQL (es lo que el `.env`
  ya tiene configurado). `rule_generation.py` (Ollama) queda como referencia.
- **Cambios de firma respecto al mock** (necesarios porque el backend real
  necesita saber contra qué workspace ejecutar):
  - `runValidation` ahora recibe `{connection_id, warehouse_id?, rule_set}`
    (el mock solo pasaba `rule_set`).
  - `fetchTableSchema`/`validateTableExists`/`fetchTablePreviewRows` cuelgan
    de `/connections/{id}/...` (el mock solo pasaba `fullName`).

## Pendiente de implementar
1. ~~**Puente en el frontend**~~ HECHO (2026-07-06): `frontend/src/lib/api.ts`
   (cliente fetch real) + `api-client.ts` (selector por `VITE_USE_MOCK_API`);
   los hooks importan `{ api }` desde `api-client`. Se threadeó `connection_id`
   en `runValidation`, `suggestBusinessRules` y el metastore por tabla. `tsc`
   limpio. Falta solo **QA en navegador** contra el backend real (requiere
   Databricks vivo, no verificable en sandbox).
2. **Slices restantes del backend**: `/synthetic/plan` + `/synthetic/run`
   (envolver `generation_planning.py` + `parse_plan`+`Runner`), `/pipeline/*`
   (jobs/lakeflow/verify/run) y `/history`. Aún no montados.
3. **Unificar esquema `GenerationPlan`**: hoy vive en `models.py`,
   `generation_planning.py` y `types/generation-plan.ts`. Cuando se monte el
   slice sintético, `schemas.py` debería reusar los Pydantic de `models.py`.
4. **Seguridad**: el `.env` de la raíz tiene credenciales reales en claro
   (Databricks, GitHub, Gemini) y hay un token legacy en `mock-api.ts`.
   Rotar y sacar del repo antes de cualquier despliegue.

## Trampas / notas
- Ejecución real contra Databricks no verificable en sandbox (proxy 403). El
  `.venv` del repo apunta a Python 3.14 (Mac); en Linux hay que recrear venv.
- Imports de `databricks-sdk` y `google-genai` son perezosos: la app arranca
  y el CRUD funciona aunque no estén instalados; solo fallan (controlado) las
  rutas que los usan.

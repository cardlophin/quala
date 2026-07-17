// Capa de datos simulada. Activa por defecto via VITE_USE_MOCK_API=true
// (ver .env.example). Sustituir cada funcion por una llamada fetch real
// contra VITE_API_BASE_URL cuando el backend este disponible; las firmas
// (parametros y tipos de retorno) estan pensadas para no cambiar en ese
// momento.

import type {
  BusinessRuleDraft,
  ConnectionStatus,
  DatabricksConnection,
  DatabricksJobSummary,
  DatabricksLakeflowPipelineSummary,
  GenerateSqlRulesRequest,
  GenerationPlan,
  GenerationRunResult,
  PipelineDatabricksResource,
  PipelineRunResult,
  Project,
  ProjectGraph,
  ResourceVerificationResult,
  RunHistoryEntry,
  RuleSet,
  SchemaContextSource,
  SqlWarehouse,
  TableSchemaInfo,
  ValidationFeedback,
} from "@/types";

function delay<T>(value: T, ms = 500): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

// --- Estado en memoria -------------------------------------------------
// Vacio por defecto: la app debe arrancar en /onboarding hasta que el
// usuario cree su primera conexion (ver logica de redireccion, seccion 6).
//
// Se semilla UNA conexion "legacy" (PAT + http_path, sin client_id) para
// poder demostrar el flujo de migracion a OAuth M2M en /connections (ver
// needsOAuthMigration en lib/format.ts) sin depender de datos reales.

let connections: DatabricksConnection[] = [
  {
    id: "conn_legacy_demo",
    name: "Produccion EU (antigua)",
    host: "adb-1234567890123456.7.azuredatabricks.net",
    client_id: "",
    client_secret: "",
    token: "dapi_legacy_token_demo",
    http_path: "/sql/1.0/warehouses/abcd1234",
    catalog: "main",
    status: "success",
    last_tested_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
  },
];
let projects: Project[] = [];
const history: RunHistoryEntry[] = [];

// --- Conexiones ----------------------------------------------------------

export async function fetchConnections(): Promise<DatabricksConnection[]> {
  return delay([...connections]);
}

export async function fetchConnection(
  id: string,
): Promise<DatabricksConnection | undefined> {
  return delay(connections.find((c) => c.id === id));
}

export async function createConnection(
  input: Omit<DatabricksConnection, "id" | "status" | "last_tested_at">,
): Promise<DatabricksConnection> {
  const connection: DatabricksConnection = {
    ...input,
    id: uid("conn"),
    status: "untested",
  };
  connections = [...connections, connection];
  return delay(connection);
}

export async function updateConnection(
  id: string,
  patch: Partial<DatabricksConnection>,
): Promise<DatabricksConnection> {
  connections = connections.map((c) => (c.id === id ? { ...c, ...patch } : c));
  const updated = connections.find((c) => c.id === id);
  if (!updated) throw new Error(`Conexion ${id} no encontrada`);
  return delay(updated);
}

export async function deleteConnection(id: string): Promise<void> {
  connections = connections.filter((c) => c.id !== id);
  return delay(undefined);
}

// --- SQL Warehouses --------------------------------------------------------
// TODO: reemplazar por una llamada real a w.warehouses.list() / GET
// /api/2.0/sql/warehouses usando las credenciales OAuth M2M de la
// conexion. El resultado no depende de `_connectionId` en el mock, pero se
// mantiene el parametro para que la firma no cambie al conectar el
// backend real.

const MOCK_WAREHOUSES: SqlWarehouse[] = [
  { id: "wh_starter", name: "Starter Warehouse", size: "2X-Small", state: "running" },
  { id: "wh_analytics", name: "Analytics Prod", size: "Small", state: "running" },
  { id: "wh_batch", name: "Batch Nocturno", size: "Medium", state: "stopped" },
];

export async function fetchWarehouses(_connectionId: string): Promise<SqlWarehouse[]> {
  return delay([...MOCK_WAREHOUSES], 500);
}

// TODO: reemplazar por una llamada real que instancie
// WorkspaceClient(host=..., client_id=..., client_secret=...,
// auth_type="oauth-m2m") y confirme que autentica contra el host (sin
// necesidad de resolver warehouse todavia, eso se hace despues via
// WarehousePicker).
export async function testConnection(input: {
  host: string;
  client_id: string;
  client_secret: string;
}): Promise<{ status: ConnectionStatus; message?: string }> {
  // Simulacion: valida solo que los campos tengan forma plausible.
  const looksValid =
    input.host.includes(".") &&
    input.client_id.length > 8 &&
    input.client_secret.length > 8;
  return delay(
    looksValid
      ? { status: "success" as const }
      : {
          status: "error" as const,
          message: "No se pudo autenticar el Service Principal contra el workspace.",
        },
    900,
  );
}

// --- Proyectos -----------------------------------------------------------

export async function fetchProjects(): Promise<Project[]> {
  return delay([...projects]);
}

export async function fetchProject(id: string): Promise<Project | undefined> {
  return delay(projects.find((p) => p.id === id));
}

export async function createProject(input: {
  name: string;
  connection_id?: string | null;
}): Promise<Project> {
  const project: Project = {
    ...input,
    connection_id: input.connection_id ?? null,
    id: uid("proj"),
    created_at: new Date().toISOString(),
  };
  projects = [...projects, project];
  return delay(project);
}

export async function updateProject(
  id: string,
  patch: Partial<Project>,
): Promise<Project> {
  projects = projects.map((p) => (p.id === id ? { ...p, ...patch } : p));
  const updated = projects.find((p) => p.id === id);
  if (!updated) throw new Error(`Proyecto ${id} no encontrado`);
  return delay(updated);
}

// --- Historial -------------------------------------------------------------

export async function fetchHistory(): Promise<RunHistoryEntry[]> {
  return delay([...history]);
}

// --- Metastore (tablas, esquema, preview) ---------------------------------
// Simulado: en produccion esto vendria de una llamada real al metastore de
// Databricks a traves de la conexion (connection_id).

const MOCK_SCHEMAS: Record<string, TableSchemaInfo> = {
  "main.sales.customers": {
    full_name: "main.sales.customers",
    row_count: 128_430,
    columns: [
      { name: "customer_id", data_type: "BIGINT", nullable: false, is_primary_key: true },
      { name: "email", data_type: "STRING", nullable: false },
      { name: "full_name", data_type: "STRING", nullable: true },
      { name: "country", data_type: "STRING", nullable: true },
      { name: "created_at", data_type: "TIMESTAMP", nullable: false },
    ],
  },
  "main.sales.orders": {
    full_name: "main.sales.orders",
    row_count: 894_112,
    columns: [
      { name: "order_id", data_type: "BIGINT", nullable: false, is_primary_key: true },
      {
        name: "customer_id",
        data_type: "BIGINT",
        nullable: false,
        is_foreign_key: true,
      },
      { name: "status", data_type: "STRING", nullable: false },
      { name: "total_amount", data_type: "DECIMAL(10,2)", nullable: false },
      { name: "placed_at", data_type: "TIMESTAMP", nullable: false },
    ],
  },
  "main.sales.order_items": {
    full_name: "main.sales.order_items",
    row_count: 2_310_558,
    columns: [
      { name: "order_item_id", data_type: "BIGINT", nullable: false, is_primary_key: true },
      { name: "order_id", data_type: "BIGINT", nullable: false, is_foreign_key: true },
      { name: "sku", data_type: "STRING", nullable: false },
      { name: "quantity", data_type: "INT", nullable: false },
      { name: "unit_price", data_type: "DECIMAL(10,2)", nullable: false },
    ],
  },
};

function mockRowFor(column: { name: string; data_type: string }, i: number): unknown {
  if (column.name.endsWith("_id")) return 1000 + i;
  if (column.data_type.startsWith("DECIMAL")) return Number((Math.random() * 500).toFixed(2));
  if (column.data_type === "INT" || column.data_type === "BIGINT") return Math.floor(Math.random() * 100);
  if (column.data_type === "TIMESTAMP") return new Date(Date.now() - i * 86_400_000).toISOString();
  if (column.name === "email") return `usuario${i}@ejemplo.com`;
  if (column.name === "status") return ["pending", "shipped", "delivered", "cancelled"][i % 4];
  if (column.name === "country") return ["ES", "FR", "DE", "IT", "PT"][i % 5];
  return `valor_${i}`;
}

// Deriva catalogo/esquema/tabla de las claves de MOCK_SCHEMAS
// ("main.sales.customers" -> catalog "main", schema "sales", ...).
export async function fetchCatalogs(_connectionId: string): Promise<string[]> {
  const catalogs = new Set(
    Object.keys(MOCK_SCHEMAS)
      .map((k) => k.split(".")[0])
      .filter((c): c is string => Boolean(c)),
  );
  return delay([...catalogs].sort(), 300);
}

export async function fetchSchemas(
  _connectionId: string,
  catalog: string,
): Promise<string[]> {
  const schemas = new Set(
    Object.keys(MOCK_SCHEMAS)
      .filter((k) => k.split(".")[0] === catalog)
      .map((k) => k.split(".")[1])
      .filter((s): s is string => Boolean(s)),
  );
  return delay([...schemas].sort(), 300);
}

export async function fetchTables(
  _connectionId: string,
  catalog: string,
  schema: string,
): Promise<string[]> {
  const prefix = `${catalog}.${schema}.`;
  const tables = Object.keys(MOCK_SCHEMAS).filter((k) => k.startsWith(prefix));
  return delay(tables.sort(), 400);
}

export async function fetchTableSchema(
  fullName: string,
  _connectionId?: string | null,
): Promise<TableSchemaInfo> {
  const schema = MOCK_SCHEMAS[fullName];
  if (!schema) throw new Error(`No se encontro el esquema de ${fullName}`);
  return delay(schema, 400);
}

// Usado por el boton manual "Verificar conexiones" del canvas para
// revalidar nodos "Fuente de datos" (ademas de los "Pipeline", ver
// validateResourceExists). TODO: reemplazar por una comprobacion real
// contra el catalogo de Databricks.
export async function validateTableExists(
  fullName: string,
  _connectionId?: string | null,
): Promise<ResourceVerificationResult> {
  if (!fullName) {
    return delay({ exists: false, message: "Sin tabla configurada." }, 300);
  }
  const exists = Boolean(MOCK_SCHEMAS[fullName]);
  return delay(
    {
      exists,
      message: exists
        ? "La tabla existe y es accesible."
        : `No se encontro la tabla "${fullName}" en el catalogo.`,
    },
    500,
  );
}

export async function fetchTablePreviewRows(
  fullName: string,
  _connectionId?: string | null,
): Promise<Record<string, unknown>[]> {
  const schema = MOCK_SCHEMAS[fullName];
  if (!schema) throw new Error(`No se encontro el esquema de ${fullName}`);
  const rows = Array.from({ length: 10 }, (_, i) =>
    Object.fromEntries(schema.columns.map((c) => [c.name, mockRowFor(c, i)])),
  );
  return delay(rows, 500);
}

export async function generateSqlRules(
  request: GenerateSqlRulesRequest,
): Promise<RuleSet> {
  // Se procesa siempre con el contexto especifico del nodo que hace la
  // peticion (sources[] de ESE nodo, ver GenerateSqlRulesRequest): ya no
  // se recibe una lista generica de tablas de proyecto. Un nodo de
  // Validacion puede tener VARIAS fuentes conectadas (multi-entrada), asi
  // que el FROM se arma con un JOIN entre todas ellas por alias -- la
  // condicion real de join queda como TODO porque el mock no conoce el
  // esquema completo de relaciones, solo demuestra la forma esperada del
  // SQL cuando hay que relacionar tablas.
  const [primary, ...rest] = request.sources;
  const fromClause = primary
    ? `${primary.table} AS ${primary.alias}` +
      rest
        .map(
          (s) =>
            ` LEFT JOIN ${s.table} AS ${s.alias} ON /* TODO: condicion de join entre "${primary.alias}" y "${s.alias}" */ 1=1`,
        )
        .join("")
    : "(sin fuentes resueltas todavia)";
  const rules = request.business_rules.map((rule, i) => ({
    rule_name: `regla_${i + 1}`,
    business_rule: rule,
    translatable: true,
    sql_query: `SELECT * FROM ${fromClause} WHERE NOT (/* ${rule} */ 1=1)`,
    sample_query: `SELECT * FROM ${fromClause} LIMIT 10`,
    success_condition: `0 filas incumplen: ${rule}`,
    reason: null,
  }));
  return delay({ rules }, 1200);
}

// --- Sugerencias automaticas de reglas (LLM) -------------------------------
// TODO: reemplazar por una llamada real al LLM con el esquema de las
// tablas. Aqui se simulan sugerencias con una heuristica simple sobre el
// esquema: PK -> unicidad/no-nulo, columnas no-nullable -> no vacio. Si
// hay 2+ fuentes (multi-entrada del nodo Validacion), se anaden ademas
// sugerencias RELACIONALES: cuando una columna FK de una fuente coincide
// por NOMBRE con una columna PK de otra fuente, se asume que son la misma
// entidad y se sugiere una regla de integridad referencial entre alias.

export async function suggestBusinessRules(
  sources: { alias: string; table: string }[],
  _connectionId?: string | null,
): Promise<BusinessRuleDraft[]> {
  const resolved = sources
    .map((s) => ({ ...s, schema: MOCK_SCHEMAS[s.table] }))
    .filter((s): s is typeof s & { schema: TableSchemaInfo } => Boolean(s.schema));
  if (resolved.length === 0) return delay([], 300);

  const suggestions: BusinessRuleDraft[] = [];
  for (const { alias, schema } of resolved) {
    for (const col of schema.columns) {
      if (col.is_primary_key) {
        suggestions.push({
          id: uid("sugg"),
          text: `El campo "${alias}.${col.name}" debe ser unico y no nulo.`,
          source: "suggested",
        });
      } else if (!col.nullable) {
        suggestions.push({
          id: uid("sugg"),
          text: `El campo "${alias}.${col.name}" no debe estar vacio.`,
          source: "suggested",
        });
      }
    }
  }

  if (resolved.length >= 2) {
    for (const a of resolved) {
      for (const b of resolved) {
        if (a.alias === b.alias) continue;
        for (const col of a.schema.columns) {
          if (!col.is_foreign_key) continue;
          const match = b.schema.columns.find((c) => c.is_primary_key && c.name === col.name);
          if (match) {
            suggestions.push({
              id: uid("sugg"),
              text: `Todo "${a.alias}.${col.name}" debe existir en "${b.alias}.${match.name}".`,
              source: "suggested",
            });
          }
        }
      }
    }
  }

  return delay(suggestions.slice(0, 6), 700);
}

// Version "IA" simulada: recibe el esquema ya resuelto (columnas + PK/FK) y
// aplica la misma heuristica sobre esas columnas. En el backend real esto lo
// hace Gemini con el esquema y las relaciones.
export async function suggestBusinessRulesAi(
  sources: {
    alias: string;
    table: string;
    columns: {
      name: string;
      type: string;
      is_primary_key?: boolean;
      is_foreign_key?: boolean;
    }[];
  }[],
  _connectionId?: string | null,
): Promise<BusinessRuleDraft[]> {
  const draft = (text: string): BusinessRuleDraft => ({
    id: uid("sugg"),
    text,
    source: "suggested",
  });
  const out: BusinessRuleDraft[] = [];
  for (const s of sources) {
    for (const c of s.columns) {
      if (c.is_primary_key)
        out.push(draft(`El campo "${s.alias}.${c.name}" debe ser único y no nulo.`));
    }
  }
  for (const a of sources) {
    for (const b of sources) {
      if (a.alias === b.alias) continue;
      for (const c of a.columns) {
        if (!c.is_foreign_key && !c.name.endsWith("_id")) continue;
        const match = b.columns.find((x) => x.is_primary_key && x.name === c.name);
        if (match)
          out.push(
            draft(`Todo "${a.alias}.${c.name}" debe existir en "${b.alias}.${match.name}".`),
          );
      }
    }
  }
  return delay(out.slice(0, 8), 900);
}

// --- Validacion: ejecutar el RuleSet contra la tabla real -----------------
// TODO: reemplazar por llamada real a la API (backend evalua el SQL contra
// Databricks). Aqui se simula un veredicto por regla con datos plausibles.

export async function runValidation(
  ruleSet: RuleSet,
  _opts?: { connectionId: string; warehouseId?: string | null },
): Promise<ValidationFeedback> {
  // Simula un fallo de ejecucion real (no de reglas individuales, sino del
  // propio warehouse/SQL) para poder mostrar un mensaje de error especifico
  // en el panel del nodo en vez de uno generico (seccion 3.1.4 del refactor
  // de paneles de nodo). TODO: sustituir por el error real que devuelva
  // Databricks al ejecutar el RuleSet.
  const failedRule = ruleSet.rules.find((r) => r.translatable);
  if (failedRule && Math.random() < 0.12) {
    const feedback: ValidationFeedback = {
      status: "error",
      source: "mock",
      total_rules: ruleSet.rules.length,
      evaluated_rules: 0,
      skipped_rules: 0,
      passed_rules: 0,
      failed_rules: [],
      data_quality_score: 0,
      verdicts: [],
      sample_invalid_rows: {},
      message: `Error ejecutando "${failedRule.rule_name}" en el warehouse: la consulta excedio el timeout de 30s (SELECT COUNT(*) FROM ${failedRule.sample_query?.match(/FROM\s+(\S+)/)?.[1] ?? "la tabla de entrada"}).`,
    };
    return delay(feedback, 1200);
  }

  const verdicts = ruleSet.rules.map((rule, i) => {
    const passed = rule.translatable ? i % 4 !== 3 : null;
    const skipped = !rule.translatable;
    return {
      rule_name: rule.rule_name,
      business_rule: rule.business_rule,
      passed: skipped ? null : passed,
      failed_rows: skipped ? null : passed ? 0 : Math.floor(Math.random() * 40) + 1,
      success_condition: rule.success_condition,
      skipped_reason: skipped ? "No se pudo traducir a SQL" : null,
    };
  });
  const evaluated = verdicts.filter((v) => v.skipped_reason === null);
  const passedCount = evaluated.filter((v) => v.passed).length;
  const score =
    evaluated.length === 0
      ? 100
      : Math.round((passedCount / evaluated.length) * 100);

  const feedback: ValidationFeedback = {
    status: passedCount === evaluated.length ? "ok" : "failed_rules",
    source: "mock",
    total_rules: ruleSet.rules.length,
    evaluated_rules: evaluated.length,
    skipped_rules: ruleSet.rules.length - evaluated.length,
    passed_rules: passedCount,
    failed_rules: evaluated.filter((v) => !v.passed).map((v) => v.rule_name),
    data_quality_score: score,
    verdicts,
    sample_invalid_rows: Object.fromEntries(
      evaluated
        .filter((v) => !v.passed)
        .map((v) => [
          v.rule_name,
          Array.from({ length: Math.min(v.failed_rows ?? 0, 5) }, (_, i) => ({
            id: 1000 + i,
            motivo: `Incumple: ${v.business_rule}`,
          })),
        ]),
    ),
    message: null,
  };
  return delay(feedback, 1400);
}

// --- Generacion sintetica: plan + ejecucion --------------------------------
// TODO: reemplazar por llamadas reales al planner/generador del backend.

export async function generatePlan(
  description: string,
  _schemaContext?: SchemaContextSource[] | null,
): Promise<GenerationPlan> {
  const tableName = description
    .toLowerCase()
    .match(/[a-z_]+/)?.[0]
    ?.slice(0, 20) ?? "datos_generados";

  const plan: GenerationPlan = {
    version: "1.0",
    needs_clarification: false,
    clarifications: [],
    assumptions: [
      "Se asume volumen moderado (miles de filas) salvo indicacion contraria.",
    ],
    input_summary: {
      domain: "generico",
      description,
      notes: [],
    },
    catalogs: [],
    tables: [
      {
        name: tableName,
        description: `Tabla generada a partir de: "${description}"`,
        row_count: 500,
        fields: [
          {
            name: "id",
            logical_type: "integer",
            nullable: false,
            generator: { type: "sequence", config: { start: 1 } },
            constraints: [],
          },
          {
            name: "nombre",
            logical_type: "string",
            nullable: false,
            generator: { type: "faker", config: { provider: "name" } },
            constraints: [],
          },
          {
            name: "creado_en",
            logical_type: "datetime",
            nullable: false,
            generator: { type: "date_range", config: {} },
            constraints: [],
          },
        ],
        depends_on: [],
      },
    ],
    runner: {
      seed: 42,
      locale: "es_ES",
      execution_order: [tableName],
      output_modes: { formats: ["delta"], include_invalid: false },
      batching: { enabled: false, batch_size: 1000 },
    },
    edge_cases: { enabled: false, cases: [] },
  };
  return delay(plan, 1000);
}

export async function writeSyntheticToDatabricks(params: {
  connectionId: string;
  plan: GenerationPlan;
  catalog: string;
  schema: string;
  warehouseId?: string | null;
}): Promise<{
  schema: string;
  tables: { name: string; full_name: string; row_count: number }[];
}> {
  return delay(
    {
      schema: `${params.catalog}.${params.schema}`,
      tables: params.plan.tables.map((t) => ({
        name: t.name,
        full_name: `${params.catalog}.${params.schema}.${t.name}`,
        row_count: t.row_count,
      })),
    },
    1400,
  );
}

export async function runGeneration(
  plan: GenerationPlan,
): Promise<GenerationRunResult> {
  const table = plan.tables[0];
  const rows = table
    ? Array.from({ length: 8 }, (_, i) =>
        Object.fromEntries(
          table.fields.map((f) => [
            f.name,
            f.logical_type === "integer"
              ? i + 1
              : f.logical_type === "datetime"
                ? new Date(Date.now() - i * 86_400_000).toISOString()
                : `${f.name}_${i}`,
          ]),
        ),
      )
    : [];
  return delay(
    { preview_rows: rows, output_table: `generated.${table?.name ?? "datos"}` },
    1600,
  );
}

// --- Pipeline: ejecucion mock con logs ------------------------------------
// TODO: reemplazar por llamada real que dispare el job de Databricks y
// haga streaming de logs (websocket/SSE). Aqui se devuelve el log completo
// ya resuelto; la UI lo revela progresivamente para simular streaming.

// --- Recursos de Databricks para el nodo Pipeline: Jobs y Lakeflow --------
// TODO: reemplazar por llamadas reales a w.jobs.list()/w.jobs.get() y
// w.pipelines.list_pipelines()/w.pipelines.get() usando las credenciales
// OAuth M2M de la conexion.

const MOCK_JOBS: DatabricksJobSummary[] = [
  {
    job_id: "job_confirmados",
    name: "validar_pedidos_confirmados",
    parameters: [
      { name: "input_table", default: "" },
      { name: "environment", default: "prod" },
    ],
    last_run_summary: "Ultima ejecucion: hace 2 horas (exito)",
    workspace_url: "https://adb-1234567890123456.7.azuredatabricks.net/jobs/job_confirmados",
  },
  {
    job_id: "job_reconciliacion",
    name: "reconciliacion_diaria",
    parameters: [
      { name: "source_table", default: "" },
      { name: "fecha", default: "{{today}}" },
    ],
    last_run_summary: "Ultima ejecucion: ayer (fallo)",
    workspace_url: "https://adb-1234567890123456.7.azuredatabricks.net/jobs/job_reconciliacion",
  },
];

const MOCK_LAKEFLOW_PIPELINES: DatabricksLakeflowPipelineSummary[] = [
  {
    pipeline_id: "pl_clientes_dlt",
    name: "clientes_dlt",
    configuration: {
      "pipelines.input.table": "",
      "pipelines.catalog": "main",
    },
    input_config_key: "pipelines.input.table",
    last_run_summary: "Ultimo update: hace 40 minutos (completado)",
    workspace_url:
      "https://adb-1234567890123456.7.azuredatabricks.net/pipelines/pl_clientes_dlt",
  },
  {
    pipeline_id: "pl_pedidos_streaming",
    name: "pedidos_streaming",
    configuration: {
      source_table: "",
      checkpoint_path: "/checkpoints/pedidos",
    },
    input_config_key: "source_table",
    last_run_summary: undefined,
    workspace_url:
      "https://adb-1234567890123456.7.azuredatabricks.net/pipelines/pl_pedidos_streaming",
  },
];

export async function fetchJobs(_connectionId: string): Promise<DatabricksJobSummary[]> {
  return delay([...MOCK_JOBS], 500);
}

export async function fetchLakeflowPipelines(
  _connectionId: string,
): Promise<DatabricksLakeflowPipelineSummary[]> {
  return delay([...MOCK_LAKEFLOW_PIPELINES], 500);
}

// --- Verificacion de existencia de recursos (preparacion) ------------------
// TODO: reemplazar por llamada real a validar_recurso_existe /
// validar_parametros_compatibles contra la API de Databricks. Se invoca en
// 3 puntos (seccion 6 del refactor de grafo): al guardar la seleccion del
// recurso, justo antes de ejecutar, y desde el boton manual "Verificar
// conexiones" del canvas.
export async function validateResourceExists(
  resource: PipelineDatabricksResource,
  _connectionId?: string | null,
): Promise<ResourceVerificationResult> {
  const found =
    resource.kind === "job"
      ? MOCK_JOBS.some((j) => j.job_id === resource.resource_id)
      : MOCK_LAKEFLOW_PIPELINES.some((p) => p.pipeline_id === resource.resource_id);

  if (!resource.resource_id) {
    return delay({ exists: false, message: "No se selecciono ningun recurso." }, 300);
  }
  return delay(
    found
      ? { exists: true, message: "El recurso existe y es accesible." }
      : {
          exists: false,
          message:
            resource.kind === "job"
              ? `No se encontro el job "${resource.resource_id}" en el workspace.`
              : `No se encontro el pipeline "${resource.resource_id}" en el workspace.`,
        },
    600,
  );
}

export async function runPipeline(
  resource: PipelineDatabricksResource,
  inputTable: string,
  _params?: Record<string, string> | null,
  _connectionId?: string | null,
): Promise<PipelineRunResult> {
  const success = Math.random() > 0.15;
  const resourceLabel =
    (resource.kind === "job"
      ? MOCK_JOBS.find((j) => j.job_id === resource.resource_id)?.name
      : MOCK_LAKEFLOW_PIPELINES.find((p) => p.pipeline_id === resource.resource_id)?.name) ||
    resource.resource_id ||
    "recurso";
  const outputTable = `pipeline_output.${resourceLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
  const logs = [
    resource.kind === "job"
      ? `Iniciando ejecucion del job "${resourceLabel}"...`
      : `Disparando update del pipeline "${resourceLabel}"...`,
    `Leyendo entrada: ${inputTable}`,
    "Aplicando transformaciones...",
    `Escribiendo resultado en ${outputTable}...`,
  ];
  // El mensaje final es el mensaje LITERAL que devolveria Databricks: para
  // un Job es el `state_message` del run; para un Pipeline, el status de la
  // Update. Nunca se sustituye por un texto generico (seccion 5 del
  // refactor de grafo).
  const databricksMessage = success
    ? resource.kind === "job"
      ? "Run finished with state TERMINATED, result_state SUCCESS."
      : "Update completed successfully (status: COMPLETED)."
    : resource.kind === "job"
      ? "Run finished with state TERMINATED, result_state FAILED: task 'transform' exited with code 1."
      : "Update failed (status: FAILED): flow 'silver_pedidos' raised a data quality expectation violation.";
  logs.push(databricksMessage);
  return delay(
    {
      run_id: uid("run"),
      status: success ? "success" : "failed",
      logs,
      output_table: outputTable,
      databricks_message: databricksMessage,
    },
    1800,
  );
}

// --- Grafo de proyecto (persistencia) --------------------------------------
// TODO: reemplazar por llamadas reales a la API. Mientras no exista backend,
// el grafo se persiste en localStorage bajo una clave por project_id.

function graphStorageKey(projectId: string): string {
  return `quala-graph-${projectId}`;
}

function defaultGraph(projectId: string, connectionId: string | null): ProjectGraph {
  return {
    project_id: projectId,
    connection_id: connectionId,
    nodes: [
      {
        id: uid("node"),
        type: "validation",
        position: { x: 250, y: 150 },
        data: {
          label: "Validacion",
          status: "pending",
          config: { business_rules: [], rule_set: null, connected_sources: [] },
        },
      },
    ],
    edges: [],
  };
}

export async function fetchProjectGraph(
  projectId: string,
  connectionId: string | null,
): Promise<ProjectGraph> {
  try {
    const raw = localStorage.getItem(graphStorageKey(projectId));
    if (raw) {
      const parsed = JSON.parse(raw) as ProjectGraph;
      return delay({ ...parsed, connection_id: connectionId }, 300);
    }
  } catch {
    // localStorage corrupto o no disponible: se cae al grafo por defecto.
  }
  return delay(defaultGraph(projectId, connectionId), 300);
}

/**
 * Lectura sincrona y ligera para tarjetas/listados (ProjectCard): no hace
 * falta pasar por TanStack Query ni por el delay simulado solo para saber
 * cuantos nodos tiene un grafo y de que tipos, con localStorage ya alcanza.
 */
export function getGraphSummarySync(
  projectId: string,
): { nodeCount: number; types: string[] } | null {
  try {
    const raw = localStorage.getItem(graphStorageKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProjectGraph;
    return {
      nodeCount: parsed.nodes.length,
      types: Array.from(new Set(parsed.nodes.map((n) => n.type))),
    };
  } catch {
    return null;
  }
}

export async function saveProjectGraph(graph: ProjectGraph): Promise<void> {
  try {
    localStorage.setItem(graphStorageKey(graph.project_id), JSON.stringify(graph));
  } catch {
    // Si localStorage falla (modo privado, cuota, etc.) no bloqueamos al
    // usuario: el grafo sigue funcionando en memoria durante la sesion.
  }
  return delay(undefined, 150);
}

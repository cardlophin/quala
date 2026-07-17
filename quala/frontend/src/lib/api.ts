// Cliente HTTP real contra el backend FastAPI (VITE_API_BASE_URL).
//
// Contrapartida de mock-api.ts: MISMAS firmas de funcion, para que
// api-client.ts pueda seleccionar uno u otro segun VITE_USE_MOCK_API sin
// que los hooks cambien nada mas que el import.
//
// Endpoints implementados = slice de Validacion + conexiones + proyectos +
// grafo + metastore (ver quala/backend/api/routers/). Los que aun no tienen
// backend (jobs, lakeflow, pipeline/generacion sintetica, historial) lanzan
// un error explicito hasta que se monte su slice.

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

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(
  /\/$/,
  "",
);

function notImplemented(name: string): never {
  throw new Error(
    `"${name}" todavia no esta implementado en el backend real. ` +
      `Su slice aun no se ha montado (ver quala/backend/api/CONTEXT.md).`,
  );
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    ...options,
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      detail = JSON.parse(text).detail ?? text;
    } catch {
      /* texto plano */
    }
    throw new Error(`${res.status} ${res.statusText}: ${detail}`);
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

// Devuelve undefined en 404 (equivalente al mock que devuelve undefined
// cuando no encuentra el recurso).
async function requestOrUndefined<T>(path: string): Promise<T | undefined> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (res.status === 404) return undefined;
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

// --- Conexiones ------------------------------------------------------------

export async function fetchConnections(): Promise<DatabricksConnection[]> {
  return request("/connections");
}

export async function fetchConnection(
  id: string,
): Promise<DatabricksConnection | undefined> {
  return requestOrUndefined(`/connections/${id}`);
}

export async function createConnection(
  input: Omit<DatabricksConnection, "id" | "status" | "last_tested_at">,
): Promise<DatabricksConnection> {
  return request("/connections", { method: "POST", body: JSON.stringify(input) });
}

export async function updateConnection(
  id: string,
  patch: Partial<DatabricksConnection>,
): Promise<DatabricksConnection> {
  return request(`/connections/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export async function deleteConnection(id: string): Promise<void> {
  await request(`/connections/${id}`, { method: "DELETE" });
}

export async function fetchWarehouses(connectionId: string): Promise<SqlWarehouse[]> {
  return request(`/connections/${connectionId}/warehouses`);
}

export async function testConnection(input: {
  host: string;
  client_id: string;
  client_secret: string;
}): Promise<{ status: ConnectionStatus; message?: string }> {
  return request("/connections/test", { method: "POST", body: JSON.stringify(input) });
}

// --- Proyectos -------------------------------------------------------------

export async function fetchProjects(): Promise<Project[]> {
  return request("/projects");
}

export async function fetchProject(id: string): Promise<Project | undefined> {
  return requestOrUndefined(`/projects/${id}`);
}

export async function createProject(input: {
  name: string;
  connection_id?: string | null;
}): Promise<Project> {
  return request("/projects", { method: "POST", body: JSON.stringify(input) });
}

export async function updateProject(
  id: string,
  patch: Partial<Project>,
): Promise<Project> {
  return request(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

// --- Historial (slice no montado) ------------------------------------------

export async function fetchHistory(): Promise<RunHistoryEntry[]> {
  return notImplemented("fetchHistory");
}

// --- Metastore -------------------------------------------------------------
// Firma extendida respecto al mock: estas funciones necesitan el
// connectionId porque el backend real consulta el workspace concreto. Es un
// parametro opcional al final para no romper llamadas existentes; en modo
// real es obligatorio.

export async function fetchCatalogs(connectionId: string): Promise<string[]> {
  return request(`/connections/${connectionId}/catalogs`);
}

export async function fetchSchemas(
  connectionId: string,
  catalog: string,
): Promise<string[]> {
  return request(
    `/connections/${connectionId}/schemas?catalog=${encodeURIComponent(catalog)}`,
  );
}

export async function fetchTables(
  connectionId: string,
  catalog: string,
  schema: string,
): Promise<string[]> {
  return request(
    `/connections/${connectionId}/tables?catalog=${encodeURIComponent(catalog)}` +
      `&schema=${encodeURIComponent(schema)}`,
  );
}

export async function fetchTableSchema(
  fullName: string,
  connectionId?: string | null,
): Promise<TableSchemaInfo> {
  if (!connectionId) throw new Error("fetchTableSchema requiere connectionId en modo real.");
  return request(
    `/connections/${connectionId}/tables/schema?full_name=${encodeURIComponent(fullName)}`,
  );
}

export async function validateTableExists(
  fullName: string,
  connectionId?: string | null,
): Promise<ResourceVerificationResult> {
  if (!connectionId) throw new Error("validateTableExists requiere connectionId en modo real.");
  return request(
    `/connections/${connectionId}/tables/exists?full_name=${encodeURIComponent(fullName)}`,
  );
}

export async function fetchTablePreviewRows(
  fullName: string,
  connectionId?: string | null,
): Promise<Record<string, unknown>[]> {
  if (!connectionId)
    throw new Error("fetchTablePreviewRows requiere connectionId en modo real.");
  return request(
    `/connections/${connectionId}/tables/preview?full_name=${encodeURIComponent(fullName)}`,
  );
}

// --- Validacion ------------------------------------------------------------

export async function generateSqlRules(
  requestBody: GenerateSqlRulesRequest,
): Promise<RuleSet> {
  return request("/validation/generate-sql", {
    method: "POST",
    body: JSON.stringify(requestBody),
  });
}

export async function suggestBusinessRules(
  sources: { alias: string; table: string }[],
  connectionId?: string | null,
): Promise<BusinessRuleDraft[]> {
  if (!connectionId) throw new Error("suggestBusinessRules requiere connectionId en modo real.");
  return request("/validation/suggest-rules", {
    method: "POST",
    body: JSON.stringify({ connection_id: connectionId, sources }),
  });
}

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
  connectionId?: string | null,
): Promise<BusinessRuleDraft[]> {
  return request("/validation/suggest-rules-ai", {
    method: "POST",
    body: JSON.stringify({ connection_id: connectionId ?? null, sources }),
  });
}

export async function runValidation(
  ruleSet: RuleSet,
  opts?: { connectionId: string; warehouseId?: string | null },
): Promise<ValidationFeedback> {
  if (!opts?.connectionId) throw new Error("runValidation requiere connectionId en modo real.");
  return request("/validation/run", {
    method: "POST",
    body: JSON.stringify({
      connection_id: opts.connectionId,
      warehouse_id: opts.warehouseId ?? null,
      rule_set: ruleSet,
    }),
  });
}

// --- Generacion sintetica (slice no montado) -------------------------------

export async function generatePlan(
  description: string,
  schemaContext?: SchemaContextSource[] | null,
): Promise<GenerationPlan> {
  return request("/synthetic/plan", {
    method: "POST",
    body: JSON.stringify({ description, schema_context: schemaContext ?? null }),
  });
}

export async function runGeneration(plan: GenerationPlan): Promise<GenerationRunResult> {
  return request("/synthetic/run", { method: "POST", body: JSON.stringify({ plan }) });
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
  return request("/synthetic/write", {
    method: "POST",
    body: JSON.stringify({
      connection_id: params.connectionId,
      plan: params.plan,
      catalog: params.catalog,
      schema: params.schema,
      warehouse_id: params.warehouseId ?? null,
    }),
  });
}

// --- Pipeline / recursos Databricks (slice no montado) ---------------------

export async function fetchJobs(connectionId: string): Promise<DatabricksJobSummary[]> {
  return request(`/connections/${connectionId}/jobs`);
}

export async function fetchLakeflowPipelines(
  connectionId: string,
): Promise<DatabricksLakeflowPipelineSummary[]> {
  return request(`/connections/${connectionId}/lakeflow-pipelines`);
}

export async function validateResourceExists(
  resource: PipelineDatabricksResource,
  connectionId?: string | null,
): Promise<ResourceVerificationResult> {
  if (!connectionId)
    throw new Error("validateResourceExists requiere connectionId en modo real.");
  return request(`/connections/${connectionId}/resources/verify`, {
    method: "POST",
    body: JSON.stringify(resource),
  });
}

export async function runPipeline(
  resource: PipelineDatabricksResource,
  inputTable: string,
  params?: Record<string, string> | null,
  connectionId?: string | null,
): Promise<PipelineRunResult> {
  if (!connectionId) throw new Error("runPipeline requiere connectionId en modo real.");
  return request(`/pipeline/run`, {
    method: "POST",
    body: JSON.stringify({
      connection_id: connectionId,
      kind: resource.kind,
      resource_id: resource.resource_id,
      input_table: inputTable,
      params: params ?? null,
    }),
  });
}

// --- Grafo de proyecto -----------------------------------------------------

export async function fetchProjectGraph(
  projectId: string,
  connectionId: string | null,
): Promise<ProjectGraph> {
  const q = connectionId ? `?connection_id=${encodeURIComponent(connectionId)}` : "";
  return request(`/projects/${projectId}/graph${q}`);
}

export async function saveProjectGraph(graph: ProjectGraph): Promise<void> {
  await request(`/projects/${graph.project_id}/graph`, {
    method: "PUT",
    body: JSON.stringify(graph),
  });
}

// Resumen sincrono para tarjetas: no existe en el backend real (el grafo
// vive en SQLite, no en localStorage). Devuelve null; la tarjeta degrada a
// "sin resumen" sin romperse.
export function getGraphSummarySync(
  _projectId: string,
): { nodeCount: number; types: string[] } | null {
  return null;
}

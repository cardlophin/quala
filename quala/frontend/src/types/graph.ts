// Modelo de grafo de proyecto (refactor "canvas estilo n8n"). Un proyecto ya
// no tiene un "tipo" fijo con pasos predefinidos: es un grafo de nodos y
// conexiones que el usuario compone libremente. Ver seccion 8 de las
// instrucciones del refactor para el shape exacto pedido.

import type { BusinessRuleDraft, RuleSet } from "./validation";
import type { GenerationPlan } from "./generation-plan";
import type { PipelineResourceKind } from "./databricks-resources";

export type QualaNodeType =
  | "data_source"
  | "synthetic_generator"
  | "pipeline"
  | "validation";

export type QualaNodeStatus =
  | "pending"
  | "configuring"
  | "ready"
  | "running"
  | "completed"
  | "error";

// --- Config especifico por tipo de nodo (vive en QualaNodeData.config) ---
// Se tipan aqui para el uso interno de cada panel; en QualaNodeData el
// campo sigue siendo Record<string, unknown> tal como pide la spec, y cada
// panel hace el cast/parse correspondiente.

export interface DataSourceConfig {
  // Tabla representativa (la primera cuando hay varias). Se mantiene para
  // los caminos que asumen "una tabla de salida" (ej. cuando un nodo aguas
  // abajo pide la salida de este como una sola tabla).
  table: string | null;
  // Si el nodo referencia VARIAS tablas (selección de esquema entero o
  // multi-selección con checks). Cuando existe y tiene length >= 1, el nodo
  // es "multi-tabla" y en el canvas se marca de forma especial. `table`
  // apunta entonces a `tables[0]`. Para una sola tabla, se deja undefined.
  tables?: string[];
}

export interface SyntheticGeneratorConfig {
  description: string;
  plan: GenerationPlan | null;
  // Esquema de referencia OPCIONAL (a diferencia de connected_sources en
  // Pipeline/Validacion, aqui una entrada vacia es un estado perfectamente
  // normal, no un problema): si el nodo tiene una o mas Fuentes de datos
  // conectadas a su entrada, su esquema real (columnas, tipos) se ofrece
  // como contexto adicional para generar datos sinteticos mas fieles,
  // pudiendo incluso sustituir a la descripcion de negocio en texto libre.
  // Mismo patron de sincronizacion automatica que ConnectedSource en los
  // otros nodos: solo el alias es editable a mano.
  reference_sources: ConnectedSource[];
}

// Mapeo de un parametro de Job (Job Parameter) o de una clave del
// diccionario `configuration` de un Lakeflow Pipeline (seccion 4.1.4 del
// refactor de paneles de nodo): cada uno se resuelve a un valor fijo o a
// la tabla de entrada ya resuelta a partir de las aristas del canvas.
export interface PipelineParameterMapping {
  param_name: string;
  default_value?: string;
  // "resolved_input": tabla de la fuente de entrada activa (aguas arriba).
  // "resolved_output": tabla del nodo Fuente de datos conectado a la SALIDA
  //   del pipeline (topología datos -> pipeline -> datos; la salida se define
  //   desacoplada en un nodo de datos aguas abajo).
  // "fixed_value": valor literal.
  source: "fixed_value" | "resolved_input" | "resolved_output";
  fixed_value?: string; // solo relevante si source === "fixed_value"
  // Cuando source === "resolved_input" y hay VARIAS fuentes conectadas al
  // pipeline, node_id de la fuente concreta que resuelve ESTE parámetro (así
  // source_table, pedidos_table, etc. pueden apuntar a entradas distintas).
  // Si falta, se usa la entrada activa (active_input_source_id).
  input_source_id?: string;
}

// Un Pipeline YA NO resuelve su entrada de forma embebida dentro del
// propio panel (ver "Rediseno del panel de configuracion del nodo
// Pipeline"): el grafo es la unica fuente de verdad. `connected_sources`
// es un reflejo derivado de las aristas entrantes del nodo (mismo shape
// que ValidationConfig.connected_sources, ver ConnectedSource mas abajo) y
// se sincroniza automaticamente -- nunca se edita a mano fuera del alias.
export interface PipelineConfig {
  kind: PipelineResourceKind;
  resource_id: string;
  resource_name?: string;
  connected_sources: ConnectedSource[];
  // node_id de la fuente conectada que se usa como argumento real al
  // ejecutar el Job/Pipeline (los parametros con source: "resolved_input"
  // resuelven su valor a partir de ESTA fuente, nunca de "la primera que
  // haya"). null si no hay ninguna fuente conectada. Con una sola fuente
  // conectada queda fijada automaticamente a esa (no hay nada que elegir);
  // con 2+ el usuario elige mediante un radio button en "Entrada del
  // pipeline" (ver PipelineInputSourcesList). Si la fuente activa se
  // desconecta, se recalcula sola a la primera fuente disponible.
  active_input_source_id: string | null;
  parameter_mappings: PipelineParameterMapping[];
  // Resumen ligero de la ultima ejecucion, pensado para lecturas rapidas
  // (resumen colapsado del nodo, badges) sin tener que desempaquetar
  // `data.result` (que sigue llevando el detalle completo -- logs, run_id
  // -- via PipelineRunResult, igual que el resto de nodos del canvas).
  last_run?: {
    status: "success" | "error";
    output_table?: string;
    state_message?: string;
    executed_at: string;
  };
}

// Una fuente conectada a la entrada de un nodo Validacion, Pipeline o
// Sintetico (seccion 2 de la correccion de bugs de multi-entrada,
// extendido a Pipeline y Sintetico en sus respectivos redisenos). Ningun
// nodo que use este tipo resuelve su propia fuente de forma independiente
// -- solo depende de sus aristas de entrada en el canvas. Esta lista se
// deriva y sincroniza automaticamente a partir de esas aristas (ver
// ValidationPanel/PipelinePanel/SyntheticGeneratorPanel).
//
// El alias VISIBLE nunca se guarda tal cual: se calcula siempre con
// resolveSourceAlias (lib/format.ts) a partir de `resolved_table` (ultimo
// segmento del nombre real de tabla), salvo que el usuario lo haya
// renombrado a mano -- en ese caso, y SOLO en ese caso, se guarda en
// `custom_alias` y ese valor gana siempre. Esto corrige el bug de alias
// inventados ("datos", "datos_2") que salian de derivar el alias del
// LABEL del nodo en vez de su tabla real.
export interface ConnectedSource {
  node_id: string;
  node_type: QualaNodeType;
  // Solo presente si el usuario le puso un nombre propio a esta fuente via
  // el boton explicito "Renombrar" (nunca se genera automaticamente).
  custom_alias?: string;
  // full_name de la tabla si es data_source, o tabla de salida si es
  // pipeline/synthetic_generator ya ejecutado. undefined si el nodo
  // origen todavia no resuelve ninguna tabla (ej. pipeline sin ejecutar).
  resolved_table?: string;
}

export interface ValidationConfig {
  // Cada nodo de Validacion gestiona su PROPIO conjunto de reglas de
  // negocio: la entrada y la salida de un pipeline suelen tener esquemas
  // distintos (el pipeline transforma/agrega/renombra columnas), asi que
  // forzar las mismas reglas en ambos puntos no es correcto. Ya NO existe
  // una libreria compartida a nivel de proyecto (ver ProjectGraph). Se
  // puede copiar manualmente el contenido de otro nodo (ver
  // "copy-rules-popover" en validation-panel.tsx) pero es una utilidad
  // puntual, no una sincronizacion.
  business_rules: BusinessRuleDraft[];
  rule_set: RuleSet | null;
  // Contexto opcional en texto libre sobre los datos que el usuario escribe
  // para ayudar a la IA a traducir las reglas a SQL más fielmente (ej.
  // "la columna estado usa códigos: A=activo, B=baja"). Se envía como
  // `context` en generateSqlRules; el backend lo inyecta en el prompt.
  context_prompt?: string;
  // Fuentes conectadas a la entrada de este nodo (0, 1 o varias --
  // multi-entrada, ver seccion 2 de la correccion de bugs). Ya NO existe
  // un "caso simple" con tabla elegida a mano dentro de este panel: si el
  // usuario quiere validar una tabla sin pasar por un pipeline, tiene que
  // anadir y configurar un nodo data_source y conectarlo por arista.
  connected_sources: ConnectedSource[];
}

// --- Resultado especifico por tipo de nodo (vive en QualaNodeData.result) ---

export interface PipelineRunResult {
  run_id: string;
  status: "success" | "failed";
  logs: string[];
  // Tabla de salida del pipeline: existe para que un nodo "Validacion"
  // conectado a la salida de este pipeline (matriz de compatibilidad,
  // graph-rules.ts) tenga algo que validar.
  output_table: string;
  // Mensaje LITERAL devuelto por Databricks -- state_message de un Job Run
  // o el status de una Update de Lakeflow Pipeline, segun
  // config.databricks_resource.kind. Nunca se sustituye por un mensaje
  // generico inventado en el frontend (seccion 5 del refactor de grafo).
  databricks_message: string;
}

export interface GenerationRunResult {
  preview_rows: Record<string, unknown>[];
  output_table: string;
  // Preview de TODAS las tablas generadas por el plan (customers, orders, ...).
  // `preview_rows`/`output_table` se mantienen (primera tabla) por compat.
  tables?: { name: string; rows: Record<string, unknown>[] }[];
  row_counts?: Record<string, number>;
  is_valid?: boolean;
  // Validación de la generación: el motor comprueba que el dataset válido
  // cumple todas las constraints del plan, y aparte genera un dataset
  // INVÁLIDO con los "edge cases" (mutaciones a propósito) para poder probar
  // que las reglas/validaciones los detectan.
  validation?: {
    is_valid: boolean;
    total_issues: number;
    issues: {
      table?: string | null;
      constraint_type?: string | null;
      field_name?: string | null;
      row_index?: number | null;
      message?: string | null;
    }[];
  };
  edge_cases_generated?: string[];
  invalid_tables?: { name: string; rows: Record<string, unknown>[] }[];
}

// Contexto de esquema (columnas + PK/FK) de tablas conectadas, usado como
// contexto para la generación sintética y para sugerir reglas con IA. Es SOLO
// estructura/relaciones, nunca datos.
export interface SchemaContextSource {
  alias: string;
  table: string;
  columns: {
    name: string;
    type: string;
    is_primary_key?: boolean;
    is_foreign_key?: boolean;
  }[];
}

export interface QualaNodeData {
  label: string;
  status: QualaNodeStatus;
  config: Record<string, unknown>;
  result?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface QualaNode {
  id: string;
  type: QualaNodeType;
  position: { x: number; y: number };
  data: QualaNodeData;
}

export interface QualaEdge {
  id: string;
  source: string;
  target: string;
}

export interface ProjectGraph {
  project_id: string;
  connection_id: string | null;
  nodes: QualaNode[];
  edges: QualaEdge[];
}

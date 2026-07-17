// Debe coincidir exactamente con los modelos Pydantic del backend.
// No renombrar campos.

export interface RuleVerdict {
  rule_name: string;
  business_rule: string;
  passed: boolean | null;
  failed_rows: number | null;
  success_condition: string;
  skipped_reason: string | null;
}

export interface ValidationFeedback {
  status: "ok" | "failed_rules" | "error";
  source: string;
  total_rules: number;
  evaluated_rules: number;
  skipped_rules: number;
  passed_rules: number;
  failed_rules: string[];
  data_quality_score: number;
  verdicts: RuleVerdict[];
  sample_invalid_rows: Record<string, Record<string, unknown>[]>;
  message: string | null;
}

// --- Seccion 3.3: seleccion de tabla + reglas de negocio -----------------

export interface ColumnSchema {
  name: string;
  data_type: string;
  nullable: boolean;
  is_primary_key?: boolean;
  is_foreign_key?: boolean;
}

export interface TableSchemaInfo {
  full_name: string; // catalog.schema.table
  row_count?: number;
  columns: ColumnSchema[];
}

// uuid local, solo frontend (no viaja al backend tal cual).
export interface BusinessRuleDraft {
  id: string;
  text: string;
  source: "manual" | "suggested";
}

// Asociado explicitamente a UN nodo de Validacion concreto (no a un
// proyecto completo): cada nodo tiene su propio esquema de entrada y su
// propio conjunto de reglas, procesados de forma independiente. Un nodo
// puede tener VARIAS fuentes conectadas (ver ConnectedSource en
// types/graph.ts), asi que se manda una por cada una con su alias, para
// que el SQL generado pueda relacionarlas (JOIN) cuando la regla lo pida.
export interface GenerateSqlRulesRequest {
  connection_id: string;
  node_id: string;
  sources: { alias: string; table: string; columns: { name: string; type: string }[] }[];
  business_rules: string[];
  // Contexto libre opcional sobre los datos (ValidationConfig.context_prompt),
  // inyectado en el prompt del LLM para traducir mejor las reglas a SQL.
  context?: string;
}

export interface SQLRule {
  rule_name: string;
  business_rule: string;
  translatable: boolean;
  sql_query: string | null;
  sample_query: string | null;
  success_condition: string;
  reason: string | null;
  // true si el usuario edito manualmente el SQL generado por la IA antes de
  // ejecutar la validacion (seccion 3.1.3 del refactor de paneles de nodo).
  edited?: boolean;
}

export interface RuleSet {
  rules: SQLRule[];
}

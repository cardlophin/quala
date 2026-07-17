// Debe coincidir exactamente con los modelos Pydantic del backend.
// No renombrar campos.

export type GeneratorType =
  | "faker"
  | "template"
  | "sequence"
  | "enum"
  | "numeric_range"
  | "date_range"
  | "linked_fields"
  | "formula"
  | "foreign_key"
  // 14o generador: lee un campo ya generado de la fila padre exacta elegida
  // por un foreign_key previo (salto directo). Debe coincidir con
  // synthetic_generation/registry.py y models.py (_validate_parent_field_ref).
  | "parent_field_ref"
  | "static_catalog"
  | "uuid"
  | "boolean_probability"
  | "nullability";

export interface GeneratorSpec {
  type: GeneratorType;
  config: Record<string, unknown>;
}

export interface ConstraintSpec {
  type: string;
  config: Record<string, unknown>;
  scope: "field" | "row" | "table";
}

export interface FieldSpec {
  name: string;
  logical_type: string;
  nullable: boolean;
  generator: GeneratorSpec;
  constraints: ConstraintSpec[];
}

export interface TableSpec {
  name: string;
  description: string;
  row_count: number;
  fields: FieldSpec[];
  depends_on: string[];
}

export interface GenerationPlan {
  version: string;
  needs_clarification: boolean;
  clarifications: string[];
  assumptions: string[];
  input_summary: {
    domain?: string;
    description?: string;
    notes: string[];
  };
  catalogs: {
    name: string;
    description: string;
    entries: Record<string, unknown>[];
  }[];
  tables: TableSpec[];
  runner: {
    seed: number;
    locale: string;
    execution_order: string[];
    output_modes: {
      formats: string[];
      include_invalid: boolean;
    };
    batching: {
      enabled: boolean;
      batch_size: number;
    };
  };
  edge_cases: {
    enabled: boolean;
    cases: {
      name: string;
      type: string;
      target_table: string;
      target_field?: string;
      probability: number;
      config: Record<string, unknown>;
    }[];
  };
}

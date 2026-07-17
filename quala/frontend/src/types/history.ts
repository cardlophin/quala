// Tipo auxiliar de frontend para /history. No forma parte de la seccion 5
// de la spec (el backend no define un modelo explicito para esto todavia).
// Ajustar cuando el backend exponga el endpoint de historial real.

export type RunKind = "generation" | "pipeline" | "validation";
export type RunResultStatus = "success" | "failed" | "running";

export interface RunHistoryEntry {
  id: string;
  project_id: string;
  project_name: string;
  kind: RunKind;
  started_at: string;
  duration_ms: number | null;
  result: RunResultStatus;
  quality_score?: number;
}

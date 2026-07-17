// Refactor a canvas de grafo (React Flow, estilo n8n): un proyecto ya NO
// tiene un "tipo" fijo (`data_validation` / `pipeline_validation`) ni un
// campo `used_synthetic_data`. Un proyecto es, literalmente, nombre +
// conexion Databricks (unica para todo el grafo, opcional hasta que se
// necesite) + un grafo de nodos y conexiones que se persiste aparte (ver
// src/types/graph.ts, ProjectGraph). Esto significa que el backend
// Pydantic correspondiente TAMBIEN debe actualizarse para eliminar
// `ProjectType` y anadir el modelo de grafo.

export interface Project {
  id: string;
  name: string;
  /**
   * Opcional en la creacion: un proyecto puede existir sin conexion
   * Databricks asignada todavia. Se pide en el momento en que el grafo
   * realmente necesita hablar con Databricks (ver ConnectionRequiredPanel),
   * no como requisito de entrada al crear el proyecto. Es unica por
   * proyecto: todos los nodos de un mismo grafo la comparten.
   */
  connection_id?: string | null;
  created_at: string;
  last_run_at?: string;
  last_quality_score?: number;
}

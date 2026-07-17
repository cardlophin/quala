// Recursos de Databricks que puede ejecutar un nodo Pipeline (seccion 2.3
// del refactor de grafo): un Job (parametros explicitos) o un Lakeflow
// Pipeline (tablas inferidas del codigo via un diccionario `configuration`
// libre). Ver DatabricksMark/testConnection para el resto de la migracion
// OAuth M2M -- estos tipos son independientes de esa migracion, solo
// dependen de tener una conexion con warehouse resuelto.

export type PipelineResourceKind = "job" | "pipeline";

export interface DatabricksJobParameter {
  name: string;
  default?: string;
}

export interface DatabricksJobSummary {
  job_id: string;
  name: string;
  parameters: DatabricksJobParameter[];
  // Resumen de la ultima ejecucion conocida (mock), para mostrar en el
  // combobox de seleccion (seccion 4.1.2 del refactor de paneles de nodo).
  last_run_summary?: string;
  // URL (mock) al recurso dentro del workspace, para el boton "Ver en
  // Databricks" de la tarjeta resumen tras seleccionarlo.
  workspace_url: string;
}

export interface DatabricksLakeflowPipelineSummary {
  pipeline_id: string;
  name: string;
  // Diccionario libre de configuracion del pipeline (equivalente a los
  // "Job Parameters" de un Job, pero sin forma fija: cada pipeline define
  // las claves que quiere leer desde su propio codigo).
  configuration: Record<string, string>;
  // Heuristica del mock para senalar cual de las claves de `configuration`
  // representa la tabla de entrada -- en produccion esto lo indicaria el
  // usuario o se infiere del event_log real.
  input_config_key?: string;
  last_run_summary?: string;
  workspace_url: string;
}

/** Recurso Databricks minimo (kind + id) que ejecuta un Pipeline -- el resto
 * del detalle (nombre, parametros/configuration, url) se resuelve via
 * fetchJobs/fetchLakeflowPipelines y no necesita duplicarse en el grafo. */
export interface PipelineDatabricksResource {
  kind: PipelineResourceKind;
  resource_id: string;
}

/**
 * Resultado de verificar que un recurso (Job o Pipeline) todavia existe y
 * es compatible con los parametros configurados. Se comprueba en 3 puntos
 * (seccion 6 del refactor de grafo): al guardar la seleccion del recurso,
 * justo antes de ejecutar, y desde el boton manual "Verificar conexiones".
 */
export interface ResourceVerificationResult {
  exists: boolean;
  message: string;
}

import type { QualaNodeType } from "@/types";

/**
 * Nombre de la variable CSS (definida en globals.css) que lleva el color
 * de identidad de cada tipo de nodo. Se referencia como `var(${...})` y
 * `var(${...}-foreground)` desde NodeShell, la lista de tarjetas del
 * proyecto, y el color de los edges salientes de cada nodo.
 */
export const NODE_IDENTITY_VAR: Record<QualaNodeType, string> = {
  data_source: "--node-data-source",
  synthetic_generator: "--node-synthetic",
  pipeline: "--node-pipeline",
  validation: "--node-validation",
};

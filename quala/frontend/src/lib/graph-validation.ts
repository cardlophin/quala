import { COMPATIBILITY, NODE_TYPE_LABELS, typesCompatible } from "./graph-rules";
import type { QualaEdge, QualaNode, QualaNodeType } from "@/types";

/**
 * True si, partiendo de `target` y siguiendo los edges YA existentes, se
 * puede llegar de vuelta a `source`. Si es asi, anadir el edge
 * source -> target cerraria un ciclo.
 */
function canReach(edges: QualaEdge[], from: string, to: string): boolean {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    adjacency.get(edge.source)!.push(edge.target);
  }

  const visited = new Set<string>();
  function dfs(node: string): boolean {
    if (node === to) return true;
    if (visited.has(node)) return false;
    visited.add(node);
    for (const next of adjacency.get(node) ?? []) {
      if (dfs(next)) return true;
    }
    return false;
  }
  return dfs(from);
}

/** Mensaje especifico segun por que se rechaza, para el toast de onConnect. */
function describeRejection(sourceType: QualaNodeType, targetType: QualaNodeType): string {
  if (COMPATIBILITY[targetType].length === 0) {
    return "Este tipo de nodo no admite conexiones de entrada.";
  }
  if (sourceType === "synthetic_generator" && targetType === "validation") {
    return "Los datos sinteticos ya se validan automaticamente al generarse; no es necesario un nodo de validacion adicional aqui.";
  }
  if (sourceType === "pipeline" && targetType === "pipeline") {
    return "Conecta primero un nodo de Validacion entre pipelines encadenados.";
  }
  return `Un nodo de "${NODE_TYPE_LABELS[targetType]}" no acepta conexiones desde "${NODE_TYPE_LABELS[sourceType]}".`;
}

export type ConnectionValidationResult = { ok: true } | { ok: false; reason: string };

/**
 * Reglas de integridad del grafo:
 * - No se permite un nodo conectado a si mismo.
 * - La conexion debe respetar la matriz de compatibilidad de tipos (ver
 *   graph-rules.ts): antes, un nodo "Validacion" era estrictamente
 *   terminal; ahora SI puede alimentar un "Pipeline" (validacion de
 *   entrada -> pipeline -> validacion de salida), pero sigue sin poder
 *   conectarse a "Fuente de datos" ni "Generar sinteticos" (no tienen
 *   entrada) ni a otro nodo de Validacion.
 * - No se permiten ciclos.
 */
export function validateConnection(params: {
  nodes: QualaNode[];
  edges: QualaEdge[];
  source: string;
  target: string;
}): ConnectionValidationResult {
  const { nodes, edges, source, target } = params;

  if (source === target) {
    return { ok: false, reason: "Un nodo no puede conectarse a si mismo." };
  }

  const sourceNode = nodes.find((n) => n.id === source);
  const targetNode = nodes.find((n) => n.id === target);
  if (!sourceNode || !targetNode) {
    return { ok: false, reason: "No se encontraron los nodos de la conexion." };
  }

  if (!typesCompatible(sourceNode.type, targetNode.type)) {
    return { ok: false, reason: describeRejection(sourceNode.type, targetNode.type) };
  }

  if (canReach(edges, target, source)) {
    return { ok: false, reason: "Esa conexion crearia un ciclo en el grafo." };
  }

  return { ok: true };
}

import type { Connection, Node } from "@xyflow/react";
import type { QualaNodeType } from "@/types";

/**
 * Matriz de compatibilidad de ENTRADA: para cada tipo de nodo destino,
 * que tipos de nodo puede aceptar conectados a su handle de entrada.
 *
 * `data_source` no tiene handle de entrada (lista vacia). `synthetic_
 * generator` SI acepta una entrada, pero OPCIONAL y de un solo tipo
 * (`data_source`): conectar una Fuente de datos real le da al generador un
 * esquema de referencia (columnas/tipos reales) para producir sinteticos
 * mas fieles, en vez de depender solo de una descripcion en texto libre
 * (ver "Esquema de referencia" en SyntheticGeneratorPanel). No admite
 * `pipeline`/`validation`/otro `synthetic_generator` como referencia por
 * ahora -- el caso de uso es "mirar el esquema de una tabla real", no
 * encadenar transformaciones. `pipeline` no puede recibir de otro
 * `pipeline` directamente: hay que intercalar un nodo de Validacion entre
 * pipelines encadenados. `validation` NO acepta `synthetic_generator` como
 * entrada porque los nodos de generacion sintetica ya ejecutan su propia
 * validacion interna como parte del paso de generacion (usando las mismas
 * reglas de negocio del proyecto) -- no tiene sentido de producto
 * encadenar un nodo de Validacion independiente justo despues. En cambio,
 * un dataset sintetico ya generado (y autovalidado) SI puede alimentar
 * directamente un `pipeline`.
 */
export const COMPATIBILITY: Record<QualaNodeType, QualaNodeType[]> = {
  // Un nodo Fuente de datos puede ser ORIGEN (el usuario elige una tabla) o
  // DESTINO/salida de un pipeline: topología datos -> pipeline -> datos. Cuando
  // recibe una arista de un `pipeline`, representa la tabla donde el pipeline
  // escribe su salida (definida desacoplada en la propia topología), y a su vez
  // puede alimentar un nodo de Validación aguas abajo.
  data_source: ["pipeline"],
  synthetic_generator: ["data_source"],
  pipeline: ["data_source", "synthetic_generator", "validation"],
  validation: ["data_source", "pipeline"],
};

export const NODE_TYPE_LABELS: Record<QualaNodeType, string> = {
  data_source: "Fuente de datos",
  synthetic_generator: "Generar datos sinteticos",
  pipeline: "Pipeline",
  validation: "Validacion",
};

export function typesCompatible(
  sourceType: QualaNodeType,
  targetType: QualaNodeType,
): boolean {
  return (COMPATIBILITY[targetType] ?? []).includes(sourceType);
}

export function allowedSourceLabels(targetType: QualaNodeType): string[] {
  return (COMPATIBILITY[targetType] ?? []).map((type) => NODE_TYPE_LABELS[type]);
}

/** "Conecta aqui: X, Y o Z", generado dinamicamente desde COMPATIBILITY para que el mensaje nunca quede desincronizado de la logica real. */
export function describeAcceptedSources(targetType: QualaNodeType): string {
  const labels = allowedSourceLabels(targetType);
  if (labels.length === 0) return "Este nodo no admite conexiones de entrada.";
  if (labels.length === 1) return `Conecta aqui: ${labels[0]}`;
  return `Conecta aqui: ${labels.slice(0, -1).join(", ")} o ${labels[labels.length - 1]}`;
}

/**
 * Funcion pura para la prop `isValidConnection` de <ReactFlow>: React Flow
 * la llama en tiempo real durante el arrastre de una conexion (con la
 * forma `(connection) => boolean`, sin nodos), asi que en
 * ProjectCanvasPage se envuelve en un closure sobre el `nodes` actual. Se
 * mantiene aqui con la firma de 2 argumentos para poder testearla sin
 * depender de React Flow.
 */
export function isValidConnection(connection: Connection, nodes: Node[]): boolean {
  const sourceNode = nodes.find((n) => n.id === connection.source);
  const targetNode = nodes.find((n) => n.id === connection.target);
  if (!sourceNode || !targetNode) return false;
  return typesCompatible(
    sourceNode.type as QualaNodeType,
    targetNode.type as QualaNodeType,
  );
}

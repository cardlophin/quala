import * as React from "react";
import type { QualaNodeStatus, QualaNodeType } from "@/types";

/** Ver getIncomingSources: una fuente conectada a la entrada de un nodo,
 * tal como existe HOY en el grafo (sin alias ni nada persistido -- eso
 * vive en ConnectedSource, ver ValidationConfig en types/graph.ts). */
export interface IncomingSource {
  node_id: string;
  node_type: QualaNodeType;
  label: string;
  resolvedTable: string | null;
  /** Estado actual del nodo origen (Pendiente/Listo/Error/...), para poder
   * mostrar el mismo badge de estado del canvas junto a cada fuente (ver
   * "Entrada del pipeline" en el panel de Pipeline). */
  status: QualaNodeStatus;
  /** Solo si node_type === "validation": las fuentes ORIGINALES que
   * alimentan a ese nodo de Validacion, leidas directamente de su propio
   * ValidationConfig.connected_sources -- nunca copiadas ni duplicadas en
   * el nodo que consulta esto (ej. un Pipeline aguas abajo). Permite ver
   * las tablas reales incluso pasando por un nodo intermedio. */
  validationSources?: { alias: string; resolved_table?: string }[];
}

interface NodeActionsContextValue {
  openPanel: (nodeId: string) => void;
  /** Cierra el panel de configuracion actualmente abierto (si hay alguno). */
  closePanel: () => void;
  /** Tabla disponible a la entrada del nodo (heredada del nodo conectado
   * aguas arriba), o null si no tiene entrada conectada o el origen aun no
   * define una tabla de salida. */
  getUpstreamTable: (nodeId: string) => string | null;
  hasIncomingEdge: (nodeId: string) => boolean;
  /** Label del nodo conectado aguas arriba, o null si no hay ninguno. Se usa
   * en el resolver de entrada del Pipeline para explicar de donde viene la
   * entrada "connected_node" en el Alert de cambio de modo. */
  getUpstreamNodeLabel: (nodeId: string) => string | null;
  /** TODAS las fuentes conectadas a la entrada de un nodo (a diferencia de
   * getUpstreamTable/getUpstreamNodeLabel, que solo miran la PRIMERA
   * arista encontrada). Lo usa el nodo Validacion, que soporta
   * multi-entrada (ver seccion 2 de la correccion de bugs de paneles). */
  getIncomingSources: (nodeId: string) => IncomingSource[];
  /** Tabla del nodo "Fuente de datos" conectado a la SALIDA de este nodo
   * (topología pipeline -> data_source). null si no hay ninguno. La usa el
   * Pipeline para resolver su parámetro de salida desde la topología del
   * grafo, sin acoplarla a la definición del recurso Databricks. */
  getOutputTable: (nodeId: string) => string | null;
  /** Autocompleta la SALIDA de un pipeline: rellena la tabla del nodo Fuente
   * de datos conectado a su salida (o CREA uno nuevo conectado si no existe)
   * con `fullName`. Se llama al seleccionar el recurso (default del parámetro
   * de salida) y tras ejecutar, para que el nodo de salida no haya que
   * definirlo a mano. */
  setOutputTable: (pipelineNodeId: string, fullName: string) => void;
  /** Elimina el/los edge(s) entrantes de un nodo. Utilidad generica del
   * grafo, sin consumidores directos por ahora tras el rediseno del panel
   * de Pipeline (que elimino la entrada embebida y, con ella, la unica
   * razon para desconectar una entrada desde dentro de un panel). */
  disconnectInput: (nodeId: string) => void;
  /** Resultado de la ultima verificacion manual ("Verificar conexiones") para
   * este nodo, o undefined si no se ha verificado en esta sesion. Solo
   * aplica a nodos "pipeline" y "data_source" (ver seccion 6 del refactor
   * de grafo). */
  getVerification: (nodeId: string) => { ok: boolean; message: string } | undefined;
  /** Centra/hace zoom en el canvas hacia un nodo concreto (usado por "Usar
   * esta salida en un nodo de Validacion" del panel de Pipeline). */
  focusNode: (nodeId: string) => void;
  /** id del nodo "validation" ya conectado a la SALIDA de este pipeline, o
   * null si ninguno lo esta todavia. */
  findDownstreamValidationNode: (pipelineNodeId: string) => string | null;
  /** Crea un nuevo nodo "validation" conectado a la salida de este pipeline
   * y devuelve su id. */
  createConnectedValidationNode: (pipelineNodeId: string) => string;
}

// Los nodos de React Flow reciben solo `id`/`data`/`selected`: no se puede
// meter una funcion dentro de `data` porque `data` se serializa a JSON al
// hacer autosave del grafo. Este contexto es el canal para que cualquier
// nodo pueda abrir su panel de configuracion o consultar el grafo sin
// pasar closures por `data`.
const NodeActionsContext = React.createContext<NodeActionsContextValue | null>(
  null,
);

export function NodeActionsProvider({
  value,
  children,
}: {
  value: NodeActionsContextValue;
  children: React.ReactNode;
}) {
  return (
    <NodeActionsContext.Provider value={value}>
      {children}
    </NodeActionsContext.Provider>
  );
}

export function useNodeActions() {
  const ctx = React.useContext(NodeActionsContext);
  if (!ctx) {
    throw new Error("useNodeActions debe usarse dentro de NodeActionsProvider");
  }
  return ctx;
}

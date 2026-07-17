import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Database,
  GitCompare,
  Plug,
  Plus,
  RefreshCw,
  ShieldCheck,
  Wand2,
  Workflow,
} from "lucide-react";
import * as React from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { CompareSheet, type CompareCandidate } from "@/components/graph/compare-sheet";
import { NODE_IDENTITY_VAR } from "@/components/graph/node-identity";
import { NodeActionsProvider, type IncomingSource } from "@/components/graph/node-actions-context";
import { nodeTypes } from "@/components/graph/nodes";
import { DataSourcePanel } from "@/components/graph/panels/data-source-panel";
import { PipelinePanel } from "@/components/graph/panels/pipeline-panel";
import { SyntheticGeneratorPanel } from "@/components/graph/panels/synthetic-generator-panel";
import {
  ValidationPanel,
  type CopyRulesSource,
} from "@/components/graph/panels/validation-panel";
import { ConnectionAssignControl } from "@/components/connections/connection-assign-control";
import { ConnectionRequiredPanel } from "@/components/connections/connection-required-panel";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/error-state";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useConnection } from "@/hooks/use-connections";
import { useValidateResourceExists } from "@/hooks/use-databricks-resources";
import { useProjectGraph, useSaveProjectGraph } from "@/hooks/use-project-graph";
import { useProject } from "@/hooks/use-projects";
import { useValidateTableExists } from "@/hooks/use-tables";
import { maskHost, resolveSourceAlias } from "@/lib/format";
import { validateConnection } from "@/lib/graph-validation";
import { isValidConnection as isValidConnectionRule } from "@/lib/graph-rules";
import { cn } from "@/lib/utils";
import type {
  DataSourceConfig,
  GenerationRunResult,
  PipelineConfig,
  PipelineRunResult,
  QualaEdge,
  QualaNode,
  QualaNodeData,
  QualaNodeType,
  SyntheticGeneratorConfig,
  ValidationConfig,
  ValidationFeedback,
} from "@/types";

const NODE_TOOLBAR_ITEMS: {
  type: QualaNodeType;
  icon: typeof Database;
  label: string;
}[] = [
  { type: "data_source", icon: Database, label: "Fuente de datos" },
  { type: "synthetic_generator", icon: Wand2, label: "Generar sinteticos" },
  { type: "pipeline", icon: Workflow, label: "Pipeline" },
  { type: "validation", icon: ShieldCheck, label: "Validacion" },
];

const NODE_TITLES: Record<QualaNodeType, string> = {
  data_source: "Fuente de datos",
  synthetic_generator: "Generar datos sinteticos",
  pipeline: "Pipeline",
  validation: "Validacion",
};

const NODE_ICONS: Record<QualaNodeType, typeof Database> = {
  data_source: Database,
  synthetic_generator: Wand2,
  pipeline: Workflow,
  validation: ShieldCheck,
};

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function createNodeData(type: QualaNodeType): QualaNodeData {
  switch (type) {
    case "data_source":
      return {
        label: NODE_TITLES.data_source,
        status: "pending",
        config: { table: null } satisfies DataSourceConfig,
      };
    case "synthetic_generator":
      return {
        label: NODE_TITLES.synthetic_generator,
        status: "pending",
        config: {
          description: "",
          plan: null,
          reference_sources: [],
        } satisfies SyntheticGeneratorConfig,
      };
    case "pipeline":
      return {
        label: NODE_TITLES.pipeline,
        status: "pending",
        config: {
          kind: "job",
          resource_id: "",
          connected_sources: [],
          active_input_source_id: null,
          parameter_mappings: [],
        } satisfies PipelineConfig,
      };
    case "validation":
      return {
        label: NODE_TITLES.validation,
        status: "pending",
        config: {
          business_rules: [],
          rule_set: null,
          connected_sources: [],
        } satisfies ValidationConfig,
      };
  }
}

function ProjectCanvasInner() {
  const { id } = useParams<{ id: string }>();
  const { data: project, isLoading: loadingProject, isError, refetch } = useProject(id);
  const { data: connection } = useConnection(project?.connection_id ?? undefined);
  const graphQuery = useProjectGraph(id, project?.connection_id);
  const saveGraph = useSaveProjectGraph();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<QualaNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [openNodeId, setOpenNodeId] = React.useState<string | null>(null);
  const [compareOpen, setCompareOpen] = React.useState(false);
  const [editingConnection, setEditingConnection] = React.useState(false);
  const [addNodeOpen, setAddNodeOpen] = React.useState(false);
  const [verification, setVerification] = React.useState<
    Record<string, { ok: boolean; message: string }>
  >({});
  const [verifying, setVerifying] = React.useState(false);
  const validateTableExists = useValidateTableExists();
  const validateResourceExists = useValidateResourceExists();
  const { setCenter, getZoom } = useReactFlow();

  const initializedRef = React.useRef(false);

  // Cargar el grafo persistido (o el que viene por defecto) una sola vez.
  React.useEffect(() => {
    if (initializedRef.current || !graphQuery.data) return;
    setNodes(graphQuery.data.nodes as unknown as Node<QualaNodeData>[]);
    setEdges(graphQuery.data.edges as unknown as Edge[]);
    initializedRef.current = true;
  }, [graphQuery.data, setNodes, setEdges]);

  // Autosave con debounce (300-500ms) sobre cualquier cambio del grafo. Las
  // reglas de negocio ya no se guardan aparte: viven dentro de la config de
  // cada nodo de Validacion (ver ValidationConfig.business_rules), asi que
  // ya viajan con `nodes`.
  React.useEffect(() => {
    if (!initializedRef.current || !id) return;
    const timeout = setTimeout(() => {
      saveGraph.mutate({
        project_id: id,
        connection_id: project?.connection_id ?? null,
        nodes: nodes as unknown as QualaNode[],
        edges: edges as unknown as QualaEdge[],
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, 400);
    return () => clearTimeout(timeout);
  }, [nodes, edges, id, project?.connection_id]);

  const updateNodeData = React.useCallback(
    (nodeId: string, patch: Partial<QualaNodeData>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)),
      );
    },
    [setNodes],
  );

  const hasIncomingEdge = React.useCallback(
    (nodeId: string) => edges.some((e) => e.target === nodeId),
    [edges],
  );

  const getUpstreamNodeLabel = React.useCallback(
    (nodeId: string): string | null => {
      const edge = edges.find((e) => e.target === nodeId);
      if (!edge) return null;
      const source = nodes.find((n) => n.id === edge.source);
      return source?.data.label ?? null;
    },
    [nodes, edges],
  );

  // Utilidad generica para soltar el/los edge(s) entrantes de un nodo. Ya
  // no la usa ningun panel directamente (el rediseno del panel de Pipeline
  // elimino su unico consumidor, el antiguo PipelineInputResolver), pero se
  // mantiene expuesta en el contexto por si algun flujo futuro necesita
  // desconectar una entrada de forma programatica.
  const disconnectInput = React.useCallback(
    (nodeId: string) => {
      setEdges((eds) => eds.filter((e) => e.target !== nodeId));
    },
    [setEdges],
  );

  // Resuelve la tabla de salida de UN nodo dado, sin importar cuantas
  // aristas de entrada tenga el nodo destino que lo consulta -- se
  // extrajo como funcion propia (en vez de vivir solo dentro de
  // getUpstreamTable) para poder reutilizarla tambien desde
  // getIncomingSources, que necesita resolver la salida de VARIOS nodos
  // origen a la vez (multi-entrada del nodo Validacion).
  const resolveNodeOutputTable = React.useCallback(
    (node: Node<QualaNodeData> | undefined): string | null => {
      if (!node) return null;
      if (node.type === "data_source") {
        const cfg = node.data.config as unknown as DataSourceConfig;
        // Para los caminos que asumen "una tabla de salida", un nodo
        // multi-tabla se representa por su primera tabla.
        return cfg.table ?? cfg.tables?.[0] ?? null;
      }
      if (node.type === "synthetic_generator") {
        const result = node.data.result as GenerationRunResult | undefined;
        return result?.output_table ?? null;
      }
      if (node.type === "pipeline") {
        const result = node.data.result as PipelineRunResult | undefined;
        return result?.output_table ?? null;
      }
      if (node.type === "validation") {
        // La validacion no transforma los datos, solo los revisa. Su
        // "salida" solo importa si alimenta un Pipeline aguas abajo (ver
        // COMPATIBILITY en graph-rules.ts); con multi-entrada (ver
        // ConnectedSource) ya no hay un unico "el" origen de un nodo de
        // Validacion, asi que como aproximacion razonable se usa la
        // PRIMERA fuente conectada. Ya NO existe un "caso simple" con
        // tabla elegida a mano (ver correccion de bugs de paneles,
        // seccion 1): la validacion depende solo de sus aristas.
        const firstEdge = edges.find((e) => e.target === node.id);
        const firstSource = firstEdge ? nodes.find((n) => n.id === firstEdge.source) : undefined;
        return resolveNodeOutputTable(firstSource);
      }
      return null;
    },
    [nodes, edges],
  );

  const getUpstreamTable = React.useCallback(
    (nodeId: string): string | null => {
      const edge = edges.find((e) => e.target === nodeId);
      if (!edge) return null;
      const source = nodes.find((n) => n.id === edge.source);
      return resolveNodeOutputTable(source);
    },
    [nodes, edges, resolveNodeOutputTable],
  );

  // Tabla del nodo "Fuente de datos" conectado a la SALIDA de este nodo
  // (topología pipeline -> data_source): la usa el Pipeline para resolver su
  // parámetro de salida desde la topología, sin acoplarla al recurso.
  const getOutputTable = React.useCallback(
    (nodeId: string): string | null => {
      for (const e of edges.filter((edge) => edge.source === nodeId)) {
        const target = nodes.find((n) => n.id === e.target);
        if (target?.type === "data_source") {
          return (
            (target.data.config as unknown as DataSourceConfig).table ?? null
          );
        }
      }
      return null;
    },
    [nodes, edges],
  );

  // TODAS las tablas que un nodo EXPONE a sus consumidores aguas abajo. Un
  // nodo Fuente de datos multi-tabla expone sus N tablas; un nodo Validacion
  // es PASS-THROUGH (no transforma) y expone las tablas de sus propias
  // entradas (recursivo), de modo que un origen multi-tabla no pierde tablas
  // al atravesar una validacion; sinteticos/pipelines exponen su(s) tabla(s)
  // de salida.
  const resolveExposedTables = React.useCallback(
    (node: Node<QualaNodeData> | undefined, depth = 0): string[] => {
      if (!node || depth > 6) return [];
      if (node.type === "data_source") {
        const cfg = node.data.config as unknown as DataSourceConfig;
        if (cfg.tables && cfg.tables.length > 0) return cfg.tables;
        return cfg.table ? [cfg.table] : [];
      }
      if (node.type === "synthetic_generator") {
        const r = node.data.result as
          | (GenerationRunResult & { written_tables?: { full_name: string }[] })
          | undefined;
        if (r?.written_tables && r.written_tables.length > 0) {
          return r.written_tables.map((w) => w.full_name);
        }
        return r?.output_table ? [r.output_table] : [];
      }
      if (node.type === "pipeline") {
        const r = node.data.result as PipelineRunResult | undefined;
        return r?.output_table ? [r.output_table] : [];
      }
      if (node.type === "validation") {
        const tables: string[] = [];
        for (const e of edges.filter((edge) => edge.target === node.id)) {
          const src = nodes.find((n) => n.id === e.source);
          tables.push(...resolveExposedTables(src, depth + 1));
        }
        return [...new Set(tables)];
      }
      return [];
    },
    [nodes, edges],
  );

  // Ver IncomingSource en node-actions-context.tsx: devuelve TODAS las fuentes
  // conectadas a la entrada de un nodo, expandiendo cada nodo origen en una
  // fuente por cada tabla que EXPONE (ver resolveExposedTables): asi un
  // Pipeline/Validacion ve todas las tablas aunque vengan de un origen
  // multi-tabla a traves de un nodo intermedio.
  const getIncomingSources = React.useCallback(
    (nodeId: string): IncomingSource[] => {
      return edges
        .filter((e) => e.target === nodeId)
        .map((e) => nodes.find((n) => n.id === e.source))
        .filter((n): n is Node<QualaNodeData> => Boolean(n))
        .flatMap((n): IncomingSource[] => {
          const tables = resolveExposedTables(n);
          if (tables.length > 1) {
            return tables.map((t) => ({
              node_id: `${n.id}::${t}`,
              node_type: n.type as QualaNodeType,
              label: n.data.label,
              resolvedTable: t,
              status: n.data.status,
            }));
          }
          return [
            {
              node_id: n.id,
              node_type: n.type as QualaNodeType,
              label: n.data.label,
              resolvedTable: tables[0] ?? resolveNodeOutputTable(n),
              status: n.data.status,
              validationSources:
                n.type === "validation"
                  ? (
                      n.data.config as unknown as ValidationConfig
                    ).connected_sources.map((s, _i, all) => ({
                      alias: resolveSourceAlias(s, all),
                      resolved_table: s.resolved_table,
                    }))
                  : undefined,
            },
          ];
        });
    },
    [nodes, edges, resolveNodeOutputTable, resolveExposedTables],
  );

  // Adaptador: la prop `isValidConnection` de <ReactFlow> solo recibe la
  // conexion (sin nodos), asi que se envuelve la funcion pura de
  // graph-rules.ts en un closure sobre el `nodes` actual. React Flow ya
  // anade las clases `connectingto`/`valid` al handle de destino mientras
  // se arrastra segun lo que esta funcion devuelva (ver CSS en
  // globals.css), sin necesidad de rastrear el drag a mano.
  const isValidConnectionForCanvas = React.useCallback(
    (connection: Connection | Edge) =>
      isValidConnectionRule(connection as Connection, nodes),
    [nodes],
  );

  // Los edges heredan el color de identidad del nodo de origen (ver
  // node-identity.ts) para reforzar visualmente que "pertenecen" a ese
  // nodo. Se deriva en cada render en vez de guardarse en el estado del
  // edge para no tener que mantenerlo sincronizado a mano.
  const styledEdges = React.useMemo(
    () =>
      edges.map((edge) => {
        const sourceType = nodes.find((n) => n.id === edge.source)?.type as
          | QualaNodeType
          | undefined;
        if (!sourceType) return edge;
        return {
          ...edge,
          style: { ...edge.style, stroke: `var(${NODE_IDENTITY_VAR[sourceType]})` },
        };
      }),
    [edges, nodes],
  );

  const getVerification = React.useCallback(
    (nodeId: string) => verification[nodeId],
    [verification],
  );

  // "Usar esta salida en un nodo de Validacion" (seccion 4.1.5 del refactor
  // de paneles de nodo): centra/hace zoom hacia un nodo ya existente, para
  // el caso en que el pipeline ya tenga un nodo de Validacion conectado a
  // su salida.
  const focusNode = React.useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      setCenter(node.position.x + 128, node.position.y + 90, {
        zoom: Math.max(getZoom(), 1),
        duration: 500,
      });
    },
    [nodes, setCenter, getZoom],
  );

  const findDownstreamValidationNode = React.useCallback(
    (pipelineNodeId: string): string | null => {
      const edge = edges.find((e) => e.source === pipelineNodeId);
      if (!edge) return null;
      const target = nodes.find((n) => n.id === edge.target);
      return target?.type === "validation" ? target.id : null;
    },
    [nodes, edges],
  );

  const createConnectedValidationNode = React.useCallback(
    (pipelineNodeId: string): string => {
      const pipelineNode = nodes.find((n) => n.id === pipelineNodeId);
      const newId = uid("node");
      const newNode: Node<QualaNodeData> = {
        id: newId,
        type: "validation",
        position: {
          x: (pipelineNode?.position.x ?? 0) + 320,
          y: pipelineNode?.position.y ?? 0,
        },
        data: createNodeData("validation"),
      };
      setNodes((nds) => [...nds, newNode]);
      setEdges((eds) =>
        addEdge({ source: pipelineNodeId, target: newId, id: `edge_${pipelineNodeId}_${newId}` }, eds),
      );
      return newId;
    },
    [nodes, setNodes, setEdges],
  );

  // Autocompleta la salida del pipeline: rellena (o crea) el nodo Fuente de
  // datos conectado a su salida con la tabla producida. Así el usuario no
  // define la tabla destino a mano: datos -> pipeline -> datos(auto).
  const setOutputTable = React.useCallback(
    (pipelineNodeId: string, fullName: string) => {
      if (!fullName) return;
      const existing = edges.find(
        (e) =>
          e.source === pipelineNodeId &&
          nodes.find((n) => n.id === e.target)?.type === "data_source",
      );
      if (existing) {
        updateNodeData(existing.target, {
          config: { table: fullName } as unknown as Record<string, unknown>,
          status: "ready",
        });
        return;
      }
      const pipelineNode = nodes.find((n) => n.id === pipelineNodeId);
      const newId = uid("node");
      const newNode: Node<QualaNodeData> = {
        id: newId,
        type: "data_source",
        position: {
          x: (pipelineNode?.position.x ?? 0) + 320,
          y: (pipelineNode?.position.y ?? 0) + 140,
        },
        data: {
          ...createNodeData("data_source"),
          config: { table: fullName },
          status: "ready",
        },
      };
      setNodes((nds) => [...nds, newNode]);
      setEdges((eds) =>
        addEdge(
          { source: pipelineNodeId, target: newId, id: `edge_${pipelineNodeId}_${newId}` },
          eds,
        ),
      );
    },
    [nodes, edges, updateNodeData, setNodes, setEdges],
  );

  const nodeActionsValue = React.useMemo(
    () => ({
      openPanel: (nodeId: string) => setOpenNodeId(nodeId),
      closePanel: () => setOpenNodeId(null),
      hasIncomingEdge,
      getUpstreamTable,
      getUpstreamNodeLabel,
      getIncomingSources,
      getOutputTable,
      setOutputTable,
      disconnectInput,
      getVerification,
      focusNode,
      findDownstreamValidationNode,
      createConnectedValidationNode,
    }),
    [
      hasIncomingEdge,
      getUpstreamTable,
      getUpstreamNodeLabel,
      getIncomingSources,
      getOutputTable,
      setOutputTable,
      disconnectInput,
      getVerification,
      focusNode,
      findDownstreamValidationNode,
      createConnectedValidationNode,
    ],
  );

  // Boton manual "Verificar conexiones" de la topbar (seccion 6 del
  // refactor de grafo): revalida todos los nodos "Fuente de datos" y
  // "Pipeline" del proyecto y actualiza un indicador visual verde/rojo por
  // nodo (ver NodeShell). TODO: en produccion esto dispararia
  // validar_recurso_existe / validar_parametros_compatibles reales contra
  // Databricks para cada nodo.
  async function handleVerifyConnections() {
    setVerifying(true);
    const results: Record<string, { ok: boolean; message: string }> = {};
    for (const node of nodes) {
      if (node.type === "data_source") {
        const config = node.data.config as unknown as DataSourceConfig;
        const check = config.table
          ? await validateTableExists.mutateAsync({
              fullName: config.table,
              connectionId: project?.connection_id,
            })
          : { exists: false, message: "Sin tabla configurada." };
        results[node.id] = { ok: check.exists, message: check.message };
      } else if (node.type === "pipeline") {
        const config = node.data.config as unknown as PipelineConfig;
        const check = config.resource_id
          ? await validateResourceExists.mutateAsync({
              resource: { kind: config.kind, resource_id: config.resource_id },
              connectionId: project?.connection_id,
            })
          : { exists: false, message: "Sin recurso configurado." };
        results[node.id] = { ok: check.exists, message: check.message };
      }
    }
    setVerification((prev) => ({ ...prev, ...results }));
    setVerifying(false);
    const total = Object.keys(results).length;
    const okCount = Object.values(results).filter((r) => r.ok).length;
    if (total === 0) {
      toast.info("No hay nodos de Fuente de datos o Pipeline que verificar todavia.");
    } else if (okCount === total) {
      toast.success(`Verificacion completa: ${total} de ${total} conexiones OK.`);
    } else {
      toast.error(`Verificacion completa: ${okCount} de ${total} conexiones OK.`);
    }
  }

  function addNode(type: QualaNodeType) {
    const newNode: Node<QualaNodeData> = {
      id: uid("node"),
      type,
      position: {
        x: 120 + (nodes.length % 4) * 40,
        y: 120 + nodes.length * 90,
      },
      data: createNodeData(type),
    };
    setNodes((nds) => [...nds, newNode]);
    // El panel de tipos de nodo se colapsa solo tras anadir uno, para no
    // obligar al usuario a cerrarlo a mano cada vez.
    setAddNodeOpen(false);
  }

  const onConnect = React.useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const result = validateConnection({
        nodes: nodes as unknown as QualaNode[],
        edges: edges as unknown as QualaEdge[],
        source: connection.source,
        target: connection.target,
      });
      if (!result.ok) {
        toast.error(result.reason);
        return;
      }
      setEdges((eds) =>
        addEdge(
          { ...connection, id: `edge_${connection.source}_${connection.target}` },
          eds,
        ),
      );
      // Ya no hace falta forzar/limpiar ningun campo de config aqui: tanto
      // Validacion como Pipeline sincronizan su `connected_sources` a partir
      // de las aristas mediante un efecto local en su propio panel (el
      // grafo es la fuente de verdad, ver PipelinePanel/ValidationPanel).
    },
    [nodes, edges, setEdges],
  );

  const openNode = nodes.find((n) => n.id === openNodeId);

  // Otros nodos de Validacion del proyecto (excluyendo el que esta
  // abierto), para la utilidad manual y opcional "Copiar reglas de otro
  // nodo" dentro del panel de Validacion.
  const copySources: CopyRulesSource[] = nodes
    .filter((n): n is Node<QualaNodeData> => n.type === "validation" && n.id !== openNodeId)
    .map((n) => ({
      nodeId: n.id,
      label: n.data.label,
      rules: (n.data.config as unknown as ValidationConfig).business_rules,
    }));

  const compareCandidates: CompareCandidate[] = nodes
    .filter((n): n is Node<QualaNodeData> => n.type === "validation" && Boolean(n.data.result))
    .map((n) => ({
      nodeId: n.id,
      label: n.data.label,
      feedback: n.data.result as unknown as ValidationFeedback,
    }));

  if (loadingProject) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (isError || !project) {
    return (
      <ErrorState
        message="No se pudo cargar el proyecto."
        onRetry={() => refetch()}
      />
    );
  }

  // NodeActionsProvider tiene que envolver TODO el arbol que pueda invocar
  // useNodeActions(), no solo <ReactFlow>: los paneles de configuracion
  // (NodeConfigSheet -> ValidationPanel/PipelinePanel) tambien lo usan
  // (hasIncomingEdge, getUpstreamTable, disconnectInput, etc.) y antes se
  // renderizaban FUERA del provider, lo que rompia la pagina con "useNodeActions
  // debe usarse dentro de NodeActionsProvider" en cuanto se abria el panel de
  // cualquier nodo. Ver seccion 0 de las instrucciones de este refactor.
  return (
    <NodeActionsProvider value={nodeActionsValue}>
    <div className="flex h-[calc(100svh-9.5rem)] flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{project.name}</h1>
        <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={verifying}
          onClick={handleVerifyConnections}
        >
          <RefreshCw className={cn("size-4", verifying && "animate-spin")} strokeWidth={1.5} />
          Verificar conexiones
        </Button>
        <Popover open={editingConnection} onOpenChange={setEditingConnection}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <span className="relative flex items-center">
                <Plug className="size-4" strokeWidth={1.5} />
                <span
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 size-1.5 rounded-full ring-2 ring-background",
                    project.connection_id ? "bg-success" : "bg-muted-foreground/50",
                  )}
                />
              </span>
              {project.connection_id ? (connection?.name ?? "Conexion") : "Sin conexion"}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <p className="mb-2 text-sm font-medium">Conexion Databricks</p>
            {connection ? (
              <p className="mb-3 font-mono text-xs text-muted-foreground">
                {maskHost(connection.host)}
              </p>
            ) : null}
            <ConnectionAssignControl
              projectId={project.id}
              currentConnectionId={project.connection_id}
              onAssigned={() => setEditingConnection(false)}
            />
          </PopoverContent>
        </Popover>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden rounded-lg border">
        {!project.connection_id ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-sm">
            <ConnectionRequiredPanel projectId={project.id} />
          </div>
        ) : null}

        <ReactFlow
            nodes={nodes}
            edges={styledEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnectionForCanvas}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable />

            <Panel position="top-left">
              {/* Colapsado por defecto (patron toolbar flotante de n8n/
                  Figma): solo un boton circular hasta que el usuario
                  interactua. Popover ya maneja click-fuera/Escape/re-click
                  de forma nativa, sin logica manual de apertura/cierre; y
                  ya trae su propia transicion fade+zoom (ver
                  components/ui/popover.tsx). */}
              <Popover open={addNodeOpen} onOpenChange={setAddNodeOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full bg-card shadow-sm"
                    aria-label="Anadir nodo"
                  >
                    <Plus className="size-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  side="bottom"
                  className="w-56 p-1.5 transition-all duration-150"
                >
                  <div className="flex flex-col gap-1">
                    {NODE_TOOLBAR_ITEMS.map(({ type, icon: Icon, label }) => (
                      <Button
                        key={type}
                        variant="ghost"
                        size="sm"
                        className="justify-start gap-2"
                        onClick={() => addNode(type)}
                      >
                        <Icon className="size-4" strokeWidth={1.5} />
                        {label}
                      </Button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </Panel>

            {compareCandidates.length >= 2 ? (
              <Panel position="top-right">
                <Button variant="outline" size="sm" onClick={() => setCompareOpen(true)}>
                  <GitCompare /> Comparar resultados
                </Button>
              </Panel>
            ) : null}
          </ReactFlow>
      </div>

      {openNode ? (
        // Cada panel monta su propio NodeConfigDialog (migracion Sheet ->
        // Dialog con pestanas): esta pagina ya no envuelve un `children`
        // generico con un shell externo, le pasa a cada panel las mismas
        // props de encabezado (icono/nombre editable/estado) que antes
        // recibia NodeConfigSheet, para que cada tipo de nodo arme sus
        // propias pestanas + barra de accion segun su contenido.
        openNode.type === "data_source" ? (
          <DataSourcePanel
            open
            onOpenChange={(open) => !open && setOpenNodeId(null)}
            icon={NODE_ICONS.data_source}
            nodeTypeLabel={NODE_TITLES.data_source}
            label={openNode.data.label}
            onLabelChange={(label) => updateNodeData(openNode.id, { label })}
            status={openNode.data.status}
            data={openNode.data}
            connectionId={project.connection_id}
            onChange={(patch) => updateNodeData(openNode.id, patch)}
          />
        ) : openNode.type === "synthetic_generator" ? (
          <SyntheticGeneratorPanel
            open
            onOpenChange={(open) => !open && setOpenNodeId(null)}
            icon={NODE_ICONS.synthetic_generator}
            nodeTypeLabel={NODE_TITLES.synthetic_generator}
            label={openNode.data.label}
            onLabelChange={(label) => updateNodeData(openNode.id, { label })}
            status={openNode.data.status}
            nodeId={openNode.id}
            data={openNode.data}
            connectionId={project.connection_id}
            onChange={(patch) => updateNodeData(openNode.id, patch)}
          />
        ) : openNode.type === "pipeline" ? (
          <PipelinePanel
            open
            onOpenChange={(open) => !open && setOpenNodeId(null)}
            icon={NODE_ICONS.pipeline}
            nodeTypeLabel={NODE_TITLES.pipeline}
            label={openNode.data.label}
            onLabelChange={(label) => updateNodeData(openNode.id, { label })}
            status={openNode.data.status}
            nodeId={openNode.id}
            data={openNode.data}
            connectionId={project.connection_id}
            onChange={(patch) => updateNodeData(openNode.id, patch)}
          />
        ) : openNode.type === "validation" ? (
          <ValidationPanel
            open
            onOpenChange={(open) => !open && setOpenNodeId(null)}
            icon={NODE_ICONS.validation}
            nodeTypeLabel={NODE_TITLES.validation}
            label={openNode.data.label}
            onLabelChange={(label) => updateNodeData(openNode.id, { label })}
            status={openNode.data.status}
            nodeId={openNode.id}
            data={openNode.data}
            connectionId={project.connection_id}
            copySources={copySources}
            onChange={(patch) => updateNodeData(openNode.id, patch)}
          />
        ) : null
      ) : null}

      <CompareSheet open={compareOpen} onOpenChange={setCompareOpen} candidates={compareCandidates} />
    </div>
    </NodeActionsProvider>
  );
}

/** Pagina principal (y unica pantalla de trabajo) de un proyecto: el canvas. */
export function ProjectCanvasPage() {
  return (
    <ReactFlowProvider>
      <ProjectCanvasInner />
    </ReactFlowProvider>
  );
}

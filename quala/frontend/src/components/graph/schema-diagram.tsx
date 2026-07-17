import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { KeyRound, Link2, Table2 } from "lucide-react";
import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTableSchemas } from "@/hooks/use-tables";
import type { ColumnSchema, TableSchemaInfo } from "@/types";

/**
 * Visor de esquema relacional (estilo ChartDB / diagramas ER): renderiza
 * cada tabla como un nodo con sus columnas (marcando PK/FK) y dibuja las
 * relaciones inferidas entre ellas. Read-only, arrastrable. Pensado para
 * inspeccionar de un vistazo un nodo "Fuente de datos" multi-tabla.
 *
 * Las relaciones se infieren: una columna FK (o `*_id`) de una tabla que
 * coincide con la PK (o el nombre) de otra tabla del conjunto crea una
 * arista hija -> padre. Es una heurística (muchas tablas no declaran FKs en
 * Unity Catalog); cuando el catálogo SÍ declara PK/FK, se usan esas marcas.
 */

interface TableNodeData {
  fullName: string;
  shortName: string;
  columns: ColumnSchema[];
  [key: string]: unknown;
}

function TableNode({ data }: { data: TableNodeData }) {
  return (
    <div className="w-56 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
      <Handle type="target" position={Position.Left} className="!size-2" />
      <Handle type="source" position={Position.Right} className="!size-2" />
      <div className="flex items-center gap-1.5 border-b bg-muted/50 px-2.5 py-1.5">
        <Table2 className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
        <span className="truncate font-mono text-xs font-medium">{data.shortName}</span>
      </div>
      <div className="divide-y">
        {data.columns.map((col) => (
          <div
            key={col.name}
            className="flex items-center justify-between gap-2 px-2.5 py-1 text-xs"
          >
            <span className="flex items-center gap-1 truncate">
              {col.is_primary_key ? (
                <KeyRound className="size-3 text-category-pipeline" strokeWidth={2} />
              ) : col.is_foreign_key ? (
                <Link2 className="size-3 text-category-data" strokeWidth={2} />
              ) : (
                <span className="size-3 shrink-0" />
              )}
              <span className="truncate font-mono">{col.name}</span>
            </span>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {col.data_type}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const nodeTypes = { table: TableNode };

function shortName(fullName: string): string {
  return fullName.split(".").slice(-1)[0] ?? fullName;
}

/** Infiere relaciones hija->padre entre las tablas cargadas. */
function inferEdges(schemas: TableSchemaInfo[]): Edge[] {
  const edges: Edge[] = [];
  const seen = new Set<string>();

  for (const child of schemas) {
    const childPk = child.columns.find((c) => c.is_primary_key)?.name;
    for (const col of child.columns) {
      const looksFk =
        col.is_foreign_key || (col.name.endsWith("_id") && col.name !== childPk);
      if (!looksFk) continue;

      // Padre candidato: otra tabla cuya PK se llama igual, o cuyo nombre
      // (último segmento) coincide con la columna sin "_id" (singular/plural).
      const base = col.name.replace(/_id$/, "");
      const parent = schemas.find((p) => {
        if (p.full_name === child.full_name) return false;
        const pkMatch = p.columns.some((c) => c.is_primary_key && c.name === col.name);
        const pShort = shortName(p.full_name).toLowerCase();
        const nameMatch = pShort === base || pShort === `${base}s` || `${pShort}s` === base;
        return pkMatch || nameMatch;
      });
      if (!parent) continue;

      const id = `${child.full_name}.${col.name}->${parent.full_name}`;
      if (seen.has(id)) continue;
      seen.add(id);
      edges.push({
        id,
        source: child.full_name,
        target: parent.full_name,
        label: col.name,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { strokeWidth: 1.5 },
        labelStyle: { fontSize: 10 },
      });
    }
  }
  return edges;
}

function Diagram({
  connectionId,
  tables,
}: {
  connectionId: string | null | undefined;
  tables: string[];
}) {
  const schemaQueries = useTableSchemas(tables, connectionId);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<TableNodeData>>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);

  const loadedKey = schemaQueries
    .map((q) => (q.data ? q.data.full_name : "-"))
    .join("|");

  React.useEffect(() => {
    const schemas = schemaQueries
      .map((q) => q.data)
      .filter((s): s is TableSchemaInfo => Boolean(s));
    if (schemas.length === 0) return;

    const perRow = Math.min(3, schemas.length);
    const nextNodes: Node<TableNodeData>[] = schemas.map((s, i) => ({
      id: s.full_name,
      type: "table",
      position: { x: (i % perRow) * 300, y: Math.floor(i / perRow) * 340 },
      data: { fullName: s.full_name, shortName: shortName(s.full_name), columns: s.columns },
    }));
    setNodes(nextNodes);
    setEdges(inferEdges(schemas));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedKey]);

  const loadingCount = schemaQueries.filter((q) => q.isLoading).length;

  if (nodes.length === 0 && loadingCount > 0) {
    return <Skeleton className="h-[420px] w-full rounded-xl" />;
  }

  return (
    <div className="h-[440px] w-full overflow-hidden rounded-xl border">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

export function SchemaDiagram({
  connectionId,
  tables,
}: {
  connectionId: string | null | undefined;
  tables: string[];
}) {
  if (tables.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Selecciona tablas para ver su diagrama relacional.
      </p>
    );
  }
  return (
    <ReactFlowProvider>
      <Diagram connectionId={connectionId} tables={tables} />
    </ReactFlowProvider>
  );
}

import type { Node, NodeProps } from "@xyflow/react";
import { Database, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useNodeActions } from "../node-actions-context";
import { NodeShell } from "../node-shell";
import type { DataSourceConfig, QualaNodeData } from "@/types";

export type DataSourceNodeType = Node<QualaNodeData, "data_source">;

/** Nodo terminal de entrada: referencia una o varias tablas reales de Databricks. */
export function DataSourceNode({ id, data, selected }: NodeProps<DataSourceNodeType>) {
  const { openPanel, getVerification } = useNodeActions();
  const config = data.config as unknown as DataSourceConfig;
  const tables = config.tables ?? [];
  const isMulti = tables.length > 1;

  return (
    <NodeShell
      icon={isMulti ? Layers : Database}
      title={data.label}
      status={data.status}
      nodeType="data_source"
      hasInput
      hasOutput
      verification={getVerification(id)}
      selected={selected}
      onOpen={() => openPanel(id)}
      summary={
        isMulti ? (
          <div className="space-y-1">
            <Badge variant="secondary" className="gap-1">
              <Layers className="size-3" strokeWidth={2} /> {tables.length} tablas
            </Badge>
            <span className="block truncate font-mono text-muted-foreground">
              {tables.map((t) => t.split(".").slice(-1)[0]).join(", ")}
            </span>
          </div>
        ) : config.table ? (
          <span className="block truncate font-mono">{config.table}</span>
        ) : (
          "Sin tabla seleccionada"
        )
      }
    />
  );
}

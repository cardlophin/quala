import type { LucideIcon } from "lucide-react";
import * as React from "react";
import { TableExplorer } from "@/components/graph/table-explorer";
import { SchemaPreview } from "@/components/graph/schema-preview";
import { SchemaDiagram } from "@/components/graph/schema-diagram";
import { NodeConfigDialog } from "@/components/graph/node-config-dialog";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { DataSourceConfig, QualaNodeData, QualaNodeStatus } from "@/types";

/**
 * Panel del nodo Fuente de datos: "Tabla" para elegir UNA tabla o VARIAS
 * (esquema entero, con checks) en Databricks, y "Esquema y datos" para su
 * esquema + preview. No ejecuta nada: solo resuelve tabla(s) que otros
 * nodos consumen por arista.
 */
export function DataSourcePanel({
  open,
  onOpenChange,
  icon,
  nodeTypeLabel,
  label,
  onLabelChange,
  status,
  data,
  connectionId,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon: LucideIcon;
  nodeTypeLabel: string;
  label: string;
  onLabelChange: (label: string) => void;
  status: QualaNodeStatus;
  data: QualaNodeData;
  connectionId: string | null | undefined;
  onChange: (patch: Partial<QualaNodeData>) => void;
}) {
  const config = data.config as unknown as DataSourceConfig;
  const multiTables = config.tables ?? [];
  const [mode, setMode] = React.useState<"single" | "multiple">(
    multiTables.length > 1 ? "multiple" : "single",
  );

  function selectTable(table: string) {
    const newConfig: DataSourceConfig = { table, tables: undefined };
    onChange({
      config: newConfig as unknown as Record<string, unknown>,
      status: "ready",
    });
  }

  function selectMultiple(tables: string[]) {
    const newConfig: DataSourceConfig = {
      table: tables[0] ?? null,
      tables: tables.length > 0 ? tables : undefined,
    };
    onChange({
      config: newConfig as unknown as Record<string, unknown>,
      status: tables.length > 0 ? "ready" : "pending",
    });
  }

  return (
    <NodeConfigDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={icon}
      nodeTypeLabel={nodeTypeLabel}
      label={label}
      onLabelChange={onLabelChange}
      status={status}
      tabs={[
        {
          value: "tabla",
          label: "Tabla",
          content: (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>¿Una tabla o varias?</Label>
                <ToggleGroup
                  type="single"
                  value={mode}
                  onValueChange={(value) => {
                    if (value === "single" || value === "multiple") setMode(value);
                  }}
                  className="justify-start"
                >
                  <ToggleGroupItem value="single">Una tabla</ToggleGroupItem>
                  <ToggleGroupItem value="multiple">Varias tablas</ToggleGroupItem>
                </ToggleGroup>
                <p className="text-xs text-muted-foreground">
                  {mode === "multiple"
                    ? "Marca con checks todas las tablas del esquema que quieras validar en un solo nodo."
                    : "El nodo referencia una única tabla."}
                </p>
              </div>

              <TableExplorer
                connectionId={connectionId}
                selected={config.table}
                onSelect={selectTable}
                mode={mode}
                selectedTables={multiTables}
                onSelectMultiple={selectMultiple}
                showSchemaPreview={false}
              />
            </div>
          ),
        },
        {
          value: "esquema",
          label: "Esquema y datos",
          content:
            multiTables.length > 1 ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Diagrama relacional de las {multiTables.length} tablas de este nodo
                  (arrastra para reorganizar):
                </p>
                <SchemaDiagram connectionId={connectionId} tables={multiTables} />
              </div>
            ) : config.table ? (
              <SchemaPreview fullName={config.table} connectionId={connectionId} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Selecciona una tabla en la pestaña "Tabla" para ver su esquema y una
                vista previa de sus filas.
              </p>
            ),
        },
      ]}
    />
  );
}

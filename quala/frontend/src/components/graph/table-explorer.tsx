import { AlertCircle, Boxes, Check, Database } from "lucide-react";
import * as React from "react";
import { SchemaPreview } from "@/components/graph/schema-preview";
import { TablePicker } from "@/components/graph/table-picker";
import { WarehousePicker } from "@/components/connections/warehouse-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useConnection } from "@/hooks/use-connections";
import { useCatalogs, useSchemas, useTables } from "@/hooks/use-tables";
import { cn } from "@/lib/utils";

/** Descompone un full_name "catalog.schema.table" en sus partes. */
function splitFullName(fullName: string | null): {
  catalog: string | null;
  schema: string | null;
} {
  if (!fullName) return { catalog: null, schema: null };
  const parts = fullName.split(".");
  return { catalog: parts[0] ?? null, schema: parts[1] ?? null };
}

type DotState = "idle" | "loading" | "ready";

/** Punto de estado de una carga contra Databricks: ámbar (pulsando) mientras
 * consulta, verde cuando ya tiene datos, gris cuando aún no aplica. */
function StatusDot({ state }: { state: DotState }) {
  return (
    <span
      title={
        state === "loading"
          ? "Consultando Databricks..."
          : state === "ready"
            ? "Cargado"
            : "Pendiente"
      }
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        state === "loading" && "animate-pulse bg-warning",
        state === "ready" && "bg-success",
        state === "idle" && "bg-muted-foreground/30",
      )}
    />
  );
}

function LabelWithDot({ children, state }: { children: React.ReactNode; state: DotState }) {
  return (
    <div className="flex items-center gap-1.5">
      <Label>{children}</Label>
      <StatusDot state={state} />
    </div>
  );
}

/**
 * Explorador de tablas: gatea en `warehouse_id` (WarehousePicker) y después
 * ofrece una selección EN CASCADA catálogo -> esquema -> tabla(s) contra el
 * workspace real. En `mode="multiple"` permite marcar varias tablas de un
 * esquema con checks (para no tener que crear un nodo por tabla).
 */
export function TableExplorer({
  connectionId,
  selected,
  onSelect,
  placeholder,
  showSchemaPreview = true,
  mode = "single",
  selectedTables = [],
  onSelectMultiple,
}: {
  connectionId: string | null | undefined;
  selected: string | null;
  onSelect: (table: string) => void;
  placeholder?: string;
  showSchemaPreview?: boolean;
  mode?: "single" | "multiple";
  selectedTables?: string[];
  onSelectMultiple?: (tables: string[]) => void;
}) {
  const { data: connection } = useConnection(connectionId ?? undefined);

  const initial = splitFullName(selected ?? selectedTables[0] ?? null);
  const [catalog, setCatalog] = React.useState<string | null>(initial.catalog);
  const [schema, setSchema] = React.useState<string | null>(initial.schema);

  const catalogsQuery = useCatalogs(connectionId);
  const schemasQuery = useSchemas(connectionId, catalog);
  const tablesQuery = useTables(connectionId, catalog, schema);
  const catalogs = catalogsQuery.data ?? [];
  const schemas = schemasQuery.data ?? [];
  const tables = tablesQuery.data ?? [];

  if (!connectionId || !connection) {
    return (
      <Alert>
        <AlertCircle />
        <AlertDescription>
          Este nodo todavia no tiene una conexion Databricks asignada.
        </AlertDescription>
      </Alert>
    );
  }

  if (!connection.warehouse_id) {
    return <WarehousePicker connectionId={connectionId} />;
  }

  const catalogDot: DotState = catalogsQuery.isLoading
    ? "loading"
    : catalogs.length > 0
      ? "ready"
      : "idle";
  const schemaDot: DotState = !catalog
    ? "idle"
    : schemasQuery.isLoading
      ? "loading"
      : schemas.length > 0
        ? "ready"
        : "idle";
  const tableDot: DotState = !schema
    ? "idle"
    : tablesQuery.isLoading
      ? "loading"
      : tables.length > 0
        ? "ready"
        : "idle";

  const tableSelected =
    selected && catalog && schema && selected.startsWith(`${catalog}.${schema}.`)
      ? selected
      : null;

  function toggleTable(fullName: string) {
    if (!onSelectMultiple) return;
    const next = selectedTables.includes(fullName)
      ? selectedTables.filter((t) => t !== fullName)
      : [...selectedTables, fullName];
    onSelectMultiple(next);
  }

  const allInSchemaSelected =
    tables.length > 0 && tables.every((t) => selectedTables.includes(t));

  function toggleAllInSchema() {
    if (!onSelectMultiple) return;
    if (allInSchemaSelected) {
      onSelectMultiple(selectedTables.filter((t) => !tables.includes(t)));
    } else {
      const merged = new Set([...selectedTables, ...tables]);
      onSelectMultiple([...merged]);
    }
  }

  const selectedInSchemaCount = tables.filter((t) => selectedTables.includes(t)).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <LabelWithDot state={catalogDot}>Catálogo</LabelWithDot>
          <TablePicker
            icon={Boxes}
            available={catalogs}
            selected={catalog}
            onSelect={(value) => {
              setCatalog(value);
              setSchema(null);
            }}
            placeholder={catalogsQuery.isLoading ? "Cargando catálogos..." : "Selecciona un catálogo..."}
            searchPlaceholder="Buscar catálogo..."
            emptyLabel="No se encontraron catálogos."
          />
        </div>
        <div className="space-y-1.5">
          <LabelWithDot state={schemaDot}>Esquema</LabelWithDot>
          <TablePicker
            icon={Database}
            available={schemas}
            selected={schema}
            onSelect={(value) => setSchema(value)}
            disabled={!catalog}
            placeholder={
              !catalog
                ? "Elige un catálogo primero"
                : schemasQuery.isLoading
                  ? "Cargando esquemas..."
                  : "Selecciona un esquema..."
            }
            searchPlaceholder="Buscar esquema..."
            emptyLabel="No se encontraron esquemas."
          />
        </div>
      </div>

      {mode === "multiple" ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <LabelWithDot state={tableDot}>
              Tablas{selectedTables.length > 0 ? ` (${selectedTables.length} en total)` : ""}
            </LabelWithDot>
            {schema && tables.length > 0 ? (
              <button
                type="button"
                onClick={toggleAllInSchema}
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                {allInSchemaSelected ? "Quitar todas" : "Seleccionar todas"}
              </button>
            ) : null}
          </div>

          {!schema ? (
            <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
              Elige un catálogo y un esquema para listar sus tablas.
            </p>
          ) : tablesQuery.isLoading ? (
            <Skeleton className="h-32 w-full rounded-xl" />
          ) : tables.length === 0 ? (
            <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
              No se encontraron tablas en este esquema.
            </p>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border p-1.5">
              {tables.map((fullName) => {
                const checked = selectedTables.includes(fullName);
                const shortName = fullName.split(".").slice(-1)[0];
                return (
                  <button
                    key={fullName}
                    type="button"
                    onClick={() => toggleTable(fullName)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted",
                      checked && "bg-muted/60",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded border",
                        checked ? "border-primary bg-primary text-primary-foreground" : "border-input",
                      )}
                    >
                      {checked ? <Check className="size-3" strokeWidth={3} /> : null}
                    </span>
                    <span className="truncate font-mono text-xs">{shortName}</span>
                  </button>
                );
              })}
            </div>
          )}

          {schema && selectedInSchemaCount > 0 ? (
            <p className="text-xs text-muted-foreground">
              {selectedInSchemaCount} de {tables.length} tablas de{" "}
              <span className="font-mono">{catalog}.{schema}</span> seleccionadas.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-1.5">
          <LabelWithDot state={tableDot}>Tabla</LabelWithDot>
          <TablePicker
            available={tables}
            selected={tableSelected}
            onSelect={onSelect}
            disabled={!catalog || !schema}
            placeholder={
              !schema
                ? "Elige un esquema primero"
                : tablesQuery.isLoading
                  ? "Cargando tablas..."
                  : (placeholder ?? "Selecciona una tabla...")
            }
            searchPlaceholder="Buscar tabla..."
            emptyLabel="No se encontraron tablas."
          />
        </div>
      )}

      {mode === "single" && showSchemaPreview && selected ? (
        <SchemaPreview fullName={selected} connectionId={connectionId} />
      ) : null}
    </div>
  );
}

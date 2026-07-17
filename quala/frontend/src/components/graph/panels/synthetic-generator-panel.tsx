import {
  Boxes,
  Loader2,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UploadCloud,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NodeConfigDialog } from "@/components/graph/node-config-dialog";
import { useNodeActions } from "@/components/graph/node-actions-context";
import {
  PipelineInputSourcesList,
  type PipelineSourceRow,
} from "@/components/graph/pipeline-input-sources-list";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { TablePicker } from "@/components/graph/table-picker";
import {
  useGeneratePlan,
  useRunGeneration,
  useWriteSynthetic,
} from "@/hooks/use-node-operations";
import { useCatalogs, useTableSchemas } from "@/hooks/use-tables";
import { resolveSourceAlias } from "@/lib/format";
import type {
  ConnectedSource,
  GenerationPlan,
  GenerationRunResult,
  QualaNodeData,
  QualaNodeStatus,
  SyntheticGeneratorConfig,
} from "@/types";

/** Version simplificada de un dump YAML del plan, solo para lectura. */
function planToYaml(plan: GenerationPlan | null | undefined): string {
  if (!plan) return "";
  const lines: string[] = [`version: "${plan.version}"`, "tables:"];
  for (const table of plan.tables) {
    lines.push(`  - name: ${table.name}`);
    lines.push(`    row_count: ${table.row_count}`);
    lines.push("    fields:");
    for (const field of table.fields) {
      lines.push(`      - name: ${field.name}`);
      lines.push(`        logical_type: ${field.logical_type}`);
      lines.push(`        generator: ${field.generator.type}`);
    }
  }
  return lines.join("\n");
}

/**
 * Panel del nodo Generador sintetico (migracion Sheet -> Dialog con
 * pestanas): "Configuracion" (esquema de referencia + descripcion +
 * "Generar plan"), "Esquema" (vista amigable/YAML del plan) y "Datos
 * generados" (preview de filas, deshabilitada hasta que haya un plan). El
 * boton final "Generar datos" vive en la barra de accion fija, distinto de
 * "Generar plan" que es un paso intermedio dentro de la pestana
 * Configuracion.
 *
 * Su entrada es OPCIONAL (a diferencia de Pipeline/Validacion): si el
 * usuario conecta una o mas Fuentes de datos a su handle de entrada,
 * aparece la lista "Esquema de referencia" (mismo componente de fila que
 * el Pipeline, ver PipelineInputSourcesList) para que el generador pueda
 * apoyarse en un esquema real en vez de depender solo de la descripcion en
 * texto libre -- que en ese caso pasa a ser opcional. Sin ninguna
 * conexion, el panel se comporta exactamente igual que antes. El esquema
 * real (columnas, tipos) de los nodos conectados se lee siempre en tiempo
 * real desde el estado de esos nodos en el canvas, nunca se copia ni se
 * cachea dentro del nodo Sintetico.
 */
export function SyntheticGeneratorPanel({
  open,
  onOpenChange,
  icon,
  nodeTypeLabel,
  label,
  onLabelChange,
  status,
  nodeId,
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
  nodeId: string;
  data: QualaNodeData;
  connectionId?: string | null;
  onChange: (patch: Partial<QualaNodeData>) => void;
}) {
  const { getIncomingSources } = useNodeActions();
  const config = data.config as unknown as SyntheticGeneratorConfig;
  const result = data.result as GenerationRunResult | undefined;
  const generatePlan = useGeneratePlan();
  const runGeneration = useRunGeneration();
  const writeSynthetic = useWriteSynthetic();
  const { data: writeCatalogs = [] } = useCatalogs(connectionId);
  const [writeCatalog, setWriteCatalog] = React.useState<string | null>(null);
  const [writeSchema, setWriteSchema] = React.useState("");

  function updateConfig(patch: Partial<SyntheticGeneratorConfig>) {
    onChange({ config: { ...config, ...patch } as unknown as Record<string, unknown> });
  }

  // Edición del plan generado antes de ejecutar: número de filas por tabla y
  // semilla. Reemplaza el plan completo en la config del nodo (autosave del
  // grafo lo persiste). El resto del plan (campos/generadores) se mantiene tal
  // cual lo devolvió la IA; aquí solo se ajustan parámetros de ejecución.
  function setTableRowCount(tableName: string, rowCount: number) {
    if (!config.plan) return;
    updateConfig({
      plan: {
        ...config.plan,
        tables: config.plan.tables.map((t) =>
          t.name === tableName ? { ...t, row_count: rowCount } : t,
        ),
      },
    });
  }

  function setSeed(seed: number) {
    if (!config.plan) return;
    updateConfig({
      plan: { ...config.plan, runner: { ...config.plan.runner, seed } },
    });
  }

  // La descripcion se escribe directamente en la config del nodo en cada
  // cambio (controlado, sin estado local intermedio): antes se guardaba en
  // un useState propio y solo se persistia al generar un plan, asi que
  // cerrar el dialog sin llegar a generar un plan perdia el texto escrito
  // -- rompiendo el autosave esperado al cerrar (criterio 10 de la
  // migracion Sheet -> Dialog).
  const description = config.description ?? "";

  // Mismo patron de sincronizacion que connected_sources en Pipeline/
  // Validacion: el alias VISIBLE nunca se autogenera ni se guarda tal
  // cual, se calcula siempre con resolveSourceAlias (ver
  // PipelineInputSourcesList); aqui solo se preserva el `custom_alias` si
  // el usuario ya renombro esta fuente a mano. La diferencia con Pipeline/
  // Validacion es que una lista vacia es un estado normal, no un problema
  // -- no hay ningun aviso de "conecta algo".
  const referenceSources = config.reference_sources ?? [];
  const incoming = getIncomingSources(nodeId);
  const incomingKey = JSON.stringify(
    incoming.map((s) => [s.node_id, s.node_type, s.resolvedTable, s.status]),
  );
  React.useEffect(() => {
    const existingById = new Map(referenceSources.map((s) => [s.node_id, s]));
    const next: ConnectedSource[] = incoming.map((s) => ({
      node_id: s.node_id,
      node_type: s.node_type,
      custom_alias: existingById.get(s.node_id)?.custom_alias,
      resolved_table: s.resolvedTable ?? undefined,
    }));
    const changed =
      next.length !== referenceSources.length ||
      next.some((s, i) => {
        const prev = referenceSources[i];
        return (
          !prev ||
          prev.node_id !== s.node_id ||
          prev.custom_alias !== s.custom_alias ||
          prev.resolved_table !== s.resolved_table ||
          prev.node_type !== s.node_type
        );
      });
    if (changed) updateConfig({ reference_sources: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingKey]);

  const hasReferenceSchema = referenceSources.length > 0;

  const rows: PipelineSourceRow[] = referenceSources.map((source) => {
    const live = incoming.find((s) => s.node_id === source.node_id);
    return { ...source, status: live?.status ?? "pending" };
  });

  const resolvedTables = rows
    .map((r) => r.resolved_table)
    .filter((t): t is string => Boolean(t));
  const schemaQueries = useTableSchemas(resolvedTables, connectionId);
  const schemasByTable = Object.fromEntries(
    resolvedTables.map((t, i) => [t, schemaQueries[i]?.data]),
  );

  function handleRenameSource(refNodeId: string, alias: string) {
    updateConfig({
      reference_sources: referenceSources.map((s) =>
        s.node_id === refNodeId ? { ...s, custom_alias: alias } : s,
      ),
    });
  }

  const canGeneratePlan = description.trim().length > 0 || hasReferenceSchema;

  async function handleGeneratePlan() {
    // Contexto de esquema (columnas + PK/FK de las Fuentes de datos
    // conectadas) — SOLO estructura/relaciones, nunca datos.
    const schemaContext = rows
      .filter((r) => r.resolved_table)
      .map((r) => ({
        alias: resolveSourceAlias(r, referenceSources),
        table: r.resolved_table as string,
        columns: (schemasByTable[r.resolved_table as string]?.columns ?? []).map(
          (c) => ({
            name: c.name,
            type: c.data_type,
            is_primary_key: c.is_primary_key,
            is_foreign_key: c.is_foreign_key,
          }),
        ),
      }));
    try {
      const newPlan = await generatePlan.mutateAsync({
        description,
        schemaContext: schemaContext.length ? schemaContext : null,
      });
      updateConfig({ plan: newPlan });
      onChange({ status: "configuring" });
      toast.success("Plan de generación creado", {
        description: `${newPlan.tables.length} tabla(s) en el plan`,
      });
    } catch (err) {
      toast.error("No se pudo generar el plan", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleRunGeneration() {
    if (!config.plan) return;
    onChange({ status: "running" });
    try {
      const genResult = await runGeneration.mutateAsync(config.plan);
      onChange({
        status: "completed",
        result: genResult as unknown as Record<string, unknown>,
      });
      toast.success("Datos sintéticos generados", {
        description: `${genResult.tables?.length ?? 1} tabla(s) generada(s)`,
      });
    } catch (err) {
      onChange({ status: "error" });
      toast.error("No se pudieron generar los datos", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleWriteToDatabricks() {
    if (!config.plan || !connectionId || !writeCatalog || !writeSchema.trim()) return;
    try {
      const out = await writeSynthetic.mutateAsync({
        connectionId,
        plan: config.plan,
        catalog: writeCatalog,
        schema: writeSchema.trim(),
      });
      // La salida del nodo pasa a ser la tabla REAL escrita, para que un nodo
      // aguas abajo (Pipeline/Validación) conectado pueda consumirla.
      const first = out.tables[0];
      onChange({
        result: {
          ...((result as unknown as Record<string, unknown>) ?? {}),
          output_table: first ? first.full_name : result?.output_table,
          written_tables: out.tables,
        } as unknown as Record<string, unknown>,
      });
      toast.success("Datos volcados a Databricks", {
        description: `${out.tables.length} tabla(s) en ${out.schema}`,
      });
    } catch (err) {
      toast.error("No se pudo volcar a Databricks", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
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
          value: "configuracion",
          label: "Configuración",
          content: (
            <div className="space-y-6">
              {hasReferenceSchema ? (
                <div className="space-y-2">
                  <Label>Esquema de referencia</Label>
                  <PipelineInputSourcesList
                    sources={rows}
                    schemasByTable={schemasByTable}
                    onAliasChange={handleRenameSource}
                  />
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="synthetic-description">
                  Descripcion del negocio
                  {hasReferenceSchema ? (
                    <span className="ml-1 font-normal text-muted-foreground">(opcional)</span>
                  ) : null}
                </Label>
                <Textarea
                  id="synthetic-description"
                  rows={4}
                  placeholder={
                    hasReferenceSchema
                      ? "Opcional: agrega contexto de negocio, o deja vacio para basarte solo en el esquema de referencia conectado..."
                      : "Ej: una tienda online de ropa con clientes, pedidos y productos..."
                  }
                  value={description}
                  onChange={(e) => updateConfig({ description: e.target.value })}
                />
                <Button
                  size="sm"
                  onClick={handleGeneratePlan}
                  disabled={!canGeneratePlan || generatePlan.isPending}
                >
                  {generatePlan.isPending ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Sparkles />
                  )}
                  Generar plan
                </Button>
              </div>
            </div>
          ),
        },
        {
          value: "esquema",
          label: "Esquema",
          content: config.plan ? (
            <div className="space-y-3">
              {config.plan.needs_clarification ? (
                <Alert variant="destructive">
                  <AlertTitle>Necesita aclaraciones</AlertTitle>
                  <AlertDescription>
                    {config.plan.clarifications.join(" ")}
                  </AlertDescription>
                </Alert>
              ) : null}

              <Tabs defaultValue="friendly">
                <TabsList>
                  <TabsTrigger value="friendly">Vista amigable</TabsTrigger>
                  <TabsTrigger value="yaml">YAML</TabsTrigger>
                </TabsList>
                <TabsContent value="friendly" className="space-y-3">
                  <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
                    <Label htmlFor="seed" className="text-xs">
                      Semilla (seed)
                    </Label>
                    <Input
                      id="seed"
                      type="number"
                      value={config.plan.runner.seed}
                      onChange={(e) => setSeed(Number(e.target.value) || 0)}
                      className="h-8 w-28"
                    />
                    <span className="text-xs text-muted-foreground">
                      Misma semilla = mismos datos (reproducible).
                    </span>
                  </div>

                  {config.plan.tables.map((table) => (
                    <div key={table.name} className="space-y-2 rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{table.name}</p>
                        <span className="text-xs text-muted-foreground">
                          {table.fields.length} campos
                        </span>
                      </div>
                      {table.description ? (
                        <p className="text-xs text-muted-foreground">{table.description}</p>
                      ) : null}
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`rows-${table.name}`} className="text-xs">
                          Nº de filas
                        </Label>
                        <Input
                          id={`rows-${table.name}`}
                          type="number"
                          min={1}
                          value={table.row_count}
                          onChange={(e) =>
                            setTableRowCount(
                              table.name,
                              Math.max(1, Math.floor(Number(e.target.value) || 0)),
                            )
                          }
                          className="h-8 w-32"
                        />
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {table.fields.map((f) => (
                          <span
                            key={f.name}
                            className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                            title={`${f.logical_type} · ${f.generator.type}`}
                          >
                            {f.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </TabsContent>
                <TabsContent value="yaml">
                  <pre className="overflow-x-auto rounded-md border bg-muted p-3 text-xs">
                    {planToYaml(config.plan)}
                  </pre>
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Genera un plan en la pestaña "Configuración" para ver su esquema aquí.
            </p>
          ),
        },
        {
          value: "datos",
          label: "Datos generados",
          disabled: !config.plan,
          content: result ? (
            <div className="space-y-4">
              {connectionId ? (
                <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
                  <div className="flex items-center gap-2">
                    <UploadCloud className="size-4 text-primary" strokeWidth={2} />
                    <span className="text-sm font-semibold">Volcar a Databricks</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Escribe las tablas en un catálogo/esquema (se crea si no existe).
                    Luego puedes conectar un nodo Pipeline para probar.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Catálogo</Label>
                      <TablePicker
                        icon={Boxes}
                        available={writeCatalogs}
                        selected={writeCatalog}
                        onSelect={setWriteCatalog}
                        placeholder="Catálogo destino..."
                        searchPlaceholder="Buscar catálogo..."
                        emptyLabel="Sin catálogos."
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Esquema (nuevo o existente)</Label>
                      <Input
                        value={writeSchema}
                        onChange={(e) => setWriteSchema(e.target.value)}
                        placeholder="ej: datos_sinteticos"
                        className="h-10"
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleWriteToDatabricks}
                    disabled={
                      !writeCatalog || !writeSchema.trim() || writeSynthetic.isPending
                    }
                  >
                    {writeSynthetic.isPending ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <UploadCloud />
                    )}
                    Volcar {config.plan?.tables.length ?? 0} tabla(s)
                  </Button>
                  {writeSynthetic.data ? (
                    <p className="text-xs text-success">
                      Escrito en {writeSynthetic.data.schema}:{" "}
                      {writeSynthetic.data.tables.map((t) => t.name).join(", ")}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Asigna una conexión Databricks al proyecto para poder volcar los datos.
                </p>
              )}

              {result.validation ? (
                <div className="space-y-2 rounded-xl border p-3">
                  <div className="flex items-center gap-2">
                    {result.validation.is_valid ? (
                      <ShieldCheck className="size-4 text-success" strokeWidth={2} />
                    ) : (
                      <TriangleAlert className="size-4 text-warning" strokeWidth={2} />
                    )}
                    <span className="text-sm font-semibold">
                      Validación de la generación
                    </span>
                    <Badge
                      variant={result.validation.is_valid ? "success" : "warning"}
                      className="ml-auto"
                    >
                      {result.validation.is_valid
                        ? "Dataset válido"
                        : `${result.validation.total_issues} incidencias`}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    El dataset generado
                    {result.validation.is_valid
                      ? " cumple todas las constraints del plan."
                      : ` incumple ${result.validation.total_issues} constraints.`}
                  </p>

                  {result.edge_cases_generated &&
                  result.edge_cases_generated.length > 0 ? (
                    <div className="space-y-1">
                      <p className="text-xs font-medium">
                        Casos límite generados para pruebas:
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {result.edge_cases_generated.map((c) => (
                          <Badge
                            key={c}
                            variant="outline"
                            className="font-mono text-[10px]"
                          >
                            {c}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Filas rotas a propósito (importes fuera de rango, emails
                        inválidos, fechas incoherentes...) para comprobar que las
                        validaciones aguas abajo las detectan.
                      </p>
                    </div>
                  ) : null}

                  {result.validation.issues.length > 0 ? (
                    <ul className="space-y-0.5 text-xs text-warning">
                      {result.validation.issues.slice(0, 8).map((i, idx) => (
                        <li key={idx}>
                          [{i.table}] {i.constraint_type}
                          {i.field_name ? ` · ${i.field_name}` : ""}: {i.message}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {result.invalid_tables && result.invalid_tables.length > 0 ? (
                    <Accordion type="single" collapsible className="rounded-lg border">
                      <AccordionItem value="invalid" className="border-b-0 px-3">
                        <AccordionTrigger className="py-2 text-xs hover:no-underline">
                          Ver filas de casos límite (dataset inválido)
                        </AccordionTrigger>
                        <AccordionContent className="space-y-3">
                          {result.invalid_tables.map((t) => (
                            <div key={t.name} className="space-y-1">
                              <p className="font-mono text-[10px] text-muted-foreground">
                                {t.name}
                              </p>
                              <div className="overflow-x-auto rounded-lg border">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      {Object.keys(t.rows[0] ?? {}).map((key) => (
                                        <TableHead key={key}>{key}</TableHead>
                                      ))}
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {t.rows.slice(0, 5).map((row, i) => (
                                      <TableRow key={i}>
                                        {Object.values(row).map((value, j) => (
                                          <TableCell key={j}>{String(value)}</TableCell>
                                        ))}
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          ))}
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  ) : null}
                </div>
              ) : null}

              {(result.tables && result.tables.length > 0
                ? result.tables
                : [{ name: result.output_table, rows: result.preview_rows }]
              ).map((t) => {
                const rowCount = result.row_counts?.[t.name];
                return (
                <div key={t.name} className="space-y-2">
                  <p className="text-sm font-medium">
                    <span className="font-mono text-xs font-normal text-muted-foreground">
                      {t.name}
                    </span>
                    {rowCount != null ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {rowCount.toLocaleString("es-ES")} filas
                      </span>
                    ) : null}
                  </p>
                  <div className="overflow-x-auto rounded-xl border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {Object.keys(t.rows[0] ?? {}).map((key) => (
                            <TableHead key={key}>{key}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {t.rows.map((row, i) => (
                          <TableRow key={i}>
                            {Object.values(row).map((value, j) => (
                              <TableCell key={j}>{String(value)}</TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Aún no se han generado datos.</p>
          ),
        },
      ]}
      actionBar={
        config.plan ? (
          <Button
            className="w-full"
            onClick={handleRunGeneration}
            disabled={runGeneration.isPending}
          >
            {runGeneration.isPending ? (
              <>
                <Loader2 className="animate-spin" /> Generando...
              </>
            ) : (
              <>
                <Sparkles /> Generar datos
              </>
            )}
          </Button>
        ) : (
          <Alert variant="warning">
            <TriangleAlert />
            <AlertTitle>No se puede generar todavia</AlertTitle>
            <AlertDescription>
              Genera un plan en la pestaña "Configuración" antes de generar los datos.
            </AlertDescription>
          </Alert>
        )
      }
    />
  );
}

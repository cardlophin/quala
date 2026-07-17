import { CheckCircle2, Loader2, Play, ShieldCheck, TriangleAlert, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NodeConfigDialog } from "@/components/graph/node-config-dialog";
import { useNodeActions } from "@/components/graph/node-actions-context";
import {
  PipelineInputSourcesList,
  type PipelineSourceRow,
} from "@/components/graph/pipeline-input-sources-list";
import { PipelineLogsStream } from "@/components/graph/pipeline-logs-stream";
import { PipelineResourcePicker } from "@/components/graph/pipeline-resource-picker";
import { useValidateResourceExists } from "@/hooks/use-databricks-resources";
import { useRunPipeline } from "@/hooks/use-node-operations";
import { useTableSchemas } from "@/hooks/use-tables";
import { resolveSourceAlias } from "@/lib/format";
import type {
  ConnectedSource,
  PipelineConfig,
  PipelineRunResult,
  QualaNodeData,
  QualaNodeStatus,
} from "@/types";

/**
 * Panel de configuracion de un nodo Pipeline (migracion Sheet -> Dialog con
 * pestanas, sobre el rediseno previo "el grafo es la fuente de verdad"): el
 * grafo sigue siendo la unica fuente de verdad para su entrada -- no hay
 * toggle ni entrada embebida, solo un reflejo de sus aristas entrantes
 * (mismo patron de sincronizacion que ValidationPanel). El boton "Ejecutar
 * pipeline" vive en la barra de accion fija y solo se habilita si hay al
 * menos una fuente conectada Y un recurso Job/Pipeline seleccionado.
 */
export function PipelinePanel({
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
  connectionId: string | null | undefined;
  onChange: (patch: Partial<QualaNodeData>) => void;
}) {
  const {
    getIncomingSources,
    getOutputTable,
    setOutputTable,
    focusNode,
    closePanel,
    openPanel,
    findDownstreamValidationNode,
    createConnectedValidationNode,
  } = useNodeActions();
  const config = data.config as unknown as PipelineConfig;
  // Tabla de salida definida por la topología: el nodo Fuente de datos
  // conectado a la SALIDA de este pipeline (datos -> pipeline -> datos).
  const outputTable = getOutputTable(nodeId);
  const result = data.result as PipelineRunResult | undefined;
  const [visibleLogs, setVisibleLogs] = React.useState<string[]>([]);
  const [verification, setVerification] = React.useState<
    { exists: boolean; message: string } | null
  >(null);
  const runPipeline = useRunPipeline();
  const validateResource = useValidateResourceExists();

  function updateConfig(patch: Partial<PipelineConfig>) {
    onChange({ config: { ...config, ...patch } as unknown as Record<string, unknown> });
  }

  // El pipeline NUNCA resuelve su propia entrada de forma independiente:
  // `connected_sources` se mantiene sincronizado con las aristas de entrada
  // REALES del canvas. El alias VISIBLE nunca se autogenera ni se guarda
  // tal cual -- se calcula siempre con resolveSourceAlias a partir del
  // nombre real de tabla (ver PipelineInputSourcesList); aqui solo se
  // preserva el `custom_alias` si el usuario ya renombro esta fuente a
  // mano. Las fuentes desconectadas desaparecen de la lista. Esto se
  // actualiza en caliente sin necesidad de cerrar y reabrir el panel.
  const incoming = getIncomingSources(nodeId);
  const incomingKey = JSON.stringify(
    incoming.map((s) => [
      s.node_id,
      s.node_type,
      s.resolvedTable,
      s.status,
      s.validationSources,
    ]),
  );
  React.useEffect(() => {
    const existingById = new Map(config.connected_sources.map((s) => [s.node_id, s]));
    const next: ConnectedSource[] = incoming.map((s) => ({
      node_id: s.node_id,
      node_type: s.node_type,
      custom_alias: existingById.get(s.node_id)?.custom_alias,
      resolved_table: s.resolvedTable ?? undefined,
    }));
    const sourcesChanged =
      next.length !== config.connected_sources.length ||
      next.some((s, i) => {
        const prev = config.connected_sources[i];
        return (
          !prev ||
          prev.node_id !== s.node_id ||
          prev.custom_alias !== s.custom_alias ||
          prev.resolved_table !== s.resolved_table ||
          prev.node_type !== s.node_type
        );
      });

    // La entrada "activa" (la que resuelve los parametros "Desde entrada
    // resultante" cuando hay 2+ fuentes conectadas) tiene que seguir
    // apuntando a una fuente todavia conectada. Si la activa se
    // desconecto, se cae automaticamente a la primera fuente disponible y
    // se avisa; si nunca hubo una activa (nodo recien conectado por
    // primera vez), simplemente se fija sin aviso -- no hay nada que
    // "cambiar" todavia.
    const nextIds = next.map((s) => s.node_id);
    let nextActiveId = config.active_input_source_id;
    let notifyFallback = false;
    if (nextIds.length === 0) {
      nextActiveId = null;
    } else if (!nextActiveId || !nextIds.includes(nextActiveId)) {
      notifyFallback = Boolean(config.active_input_source_id);
      nextActiveId = nextIds[0] ?? null;
    }
    const activeChanged = nextActiveId !== config.active_input_source_id;

    if (sourcesChanged || activeChanged) {
      updateConfig({ connected_sources: next, active_input_source_id: nextActiveId });
    }
    if (notifyFallback) {
      const newSource = next.find((s) => s.node_id === nextActiveId);
      const newAlias = newSource
        ? (newSource.custom_alias ?? newSource.resolved_table ?? nextActiveId)
        : nextActiveId;
      toast.info(`La entrada activa del pipeline cambio a "${newAlias}".`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingKey]);

  const hasInput = config.connected_sources.length > 0;
  const hasResource = Boolean(config.resource_id);
  const canRun = hasInput && hasResource;
  const activeSource =
    config.connected_sources.find((s) => s.node_id === config.active_input_source_id) ?? null;

  // Fuentes conectadas a la entrada del pipeline, con su alias resuelto. Cada
  // parámetro "resolved_input" puede apuntar a una de ellas (multi-entrada).
  const inputSources = config.connected_sources.map((s) => ({
    node_id: s.node_id,
    alias: resolveSourceAlias(s, config.connected_sources),
    resolved_table: s.resolved_table ?? null,
  }));

  // Resuelve la tabla de un parámetro "resolved_input": su fuente elegida
  // (input_source_id) o, en su defecto, la entrada activa.
  function resolveInputTable(inputSourceId?: string): string {
    const id = inputSourceId ?? config.active_input_source_id;
    const src = config.connected_sources.find((s) => s.node_id === id);
    return src?.resolved_table ?? activeSource?.resolved_table ?? "";
  }

  function handleSelectActive(nodeIdToActivate: string) {
    updateConfig({ active_input_source_id: nodeIdToActivate });
  }

  function handleRenameSource(sourceNodeId: string, alias: string) {
    updateConfig({
      connected_sources: config.connected_sources.map((s) =>
        s.node_id === sourceNodeId ? { ...s, custom_alias: alias } : s,
      ),
    });
  }

  // Combina el `connected_sources` persistido (custom_alias) con el
  // estado/validationSources en vivo del nodo origen (getIncomingSources
  // vuelve a recorrerse aqui en vez de reusar `incoming` para no acoplar
  // este calculo al orden en que llegan las aristas).
  const rows: PipelineSourceRow[] = config.connected_sources.map((source) => {
    const live = incoming.find((s) => s.node_id === source.node_id);
    return {
      ...source,
      status: live?.status ?? "pending",
      validationSources: live?.validationSources,
    };
  });

  const resolvedTables = rows
    .map((r) => r.resolved_table)
    .filter((t): t is string => Boolean(t));
  const schemaQueries = useTableSchemas(resolvedTables, connectionId);
  const schemasByTable = Object.fromEntries(
    resolvedTables.map((t, i) => [t, schemaQueries[i]?.data]),
  );

  async function handleResourcePickerChange(patch: Partial<PipelineConfig>) {
    updateConfig(patch);

    // Autocompleta la SALIDA: si el recurso declara un parámetro de salida con
    // default y aún no hay tabla en el nodo de datos de salida, se rellena
    // (creando el nodo si hace falta) para no definirlo a mano.
    if (patch.parameter_mappings && !outputTable) {
      const outParam = patch.parameter_mappings.find(
        (pm) => pm.source === "resolved_output" && pm.default_value,
      );
      if (outParam?.default_value) setOutputTable(nodeId, outParam.default_value);
    }

    // Verificacion de existencia del recurso, punto 1 de 3 (seccion 6 del
    // refactor de grafo / 4.1.5 del refactor de paneles): al guardar la
    // seleccion. TODO: reemplazar por llamada real a validar_recurso_existe.
    if (patch.resource_id) {
      setVerification(null);
      const kind = patch.kind ?? config.kind;
      const check = await validateResource.mutateAsync({
        resource: { kind, resource_id: patch.resource_id },
        connectionId,
      });
      setVerification(check);
    }
  }

  async function handleRun() {
    if (!canRun) return;

    // Verificacion de existencia del recurso, punto 2 de 3: justo antes de
    // ejecutar.
    const preRunCheck = await validateResource.mutateAsync({
      resource: { kind: config.kind, resource_id: config.resource_id },
      connectionId,
    });
    setVerification(preRunCheck);
    if (!preRunCheck.exists) {
      toast.error(preRunCheck.message);
      return;
    }

    // Resuelve los parámetros a partir de los mapeos: "resolved_input" toma la
    // tabla de entrada activa; "fixed_value" su valor fijo. Estos se pasan como
    // job_parameters (Job) o configuration (Pipeline) definidos con dbutils.
    const params: Record<string, string> = {};
    for (const pm of config.parameter_mappings) {
      params[pm.param_name] =
        pm.source === "resolved_input"
          ? resolveInputTable(pm.input_source_id)
          : pm.source === "resolved_output"
            ? (outputTable ?? pm.default_value ?? "")
            : (pm.fixed_value ?? pm.default_value ?? "");
    }
    // Tabla de salida efectiva (para autocompletar el nodo de salida tras
    // ejecutar). Prioriza el parámetro mapeado como salida.
    const outParam = config.parameter_mappings.find(
      (pm) => pm.source === "resolved_output",
    );
    const effectiveOutput = outParam ? params[outParam.param_name] : (outputTable ?? "");

    setVisibleLogs([]);
    onChange({ status: "running" });
    const runResult = await runPipeline.mutateAsync({
      resource: { kind: config.kind, resource_id: config.resource_id },
      inputTable: activeSource?.resolved_table ?? "(sin tabla de entrada)",
      params,
      connectionId,
    });
    // Revela los logs progresivamente para simular streaming (ver TODO en
    // runPipeline: en produccion esto seria un websocket/SSE real).
    runResult.logs.forEach((line, i) => {
      setTimeout(() => {
        setVisibleLogs((prev) => [...prev, line]);
      }, i * 400);
    });
    setTimeout(
      () => {
        const finalStatus = runResult.status === "success" ? "completed" : "error";
        onChange({
          status: finalStatus,
          result: runResult as unknown as Record<string, unknown>,
        });
        updateConfig({
          last_run: {
            status: runResult.status === "success" ? "success" : "error",
            output_table: runResult.output_table,
            state_message: runResult.databricks_message,
            executed_at: new Date().toISOString(),
          },
        });
        // Autocompleta la salida: vuelca la tabla producida en el nodo de
        // datos de salida (o crea uno) para no definirla a mano.
        if (runResult.status === "success") {
          const finalOutput = runResult.output_table || effectiveOutput;
          if (finalOutput) setOutputTable(nodeId, finalOutput);
        }
      },
      runResult.logs.length * 400 + 100,
    );
  }

  function handleUseOutputInValidation() {
    const existing = findDownstreamValidationNode(nodeId);
    if (existing) {
      closePanel();
      focusNode(existing);
    } else {
      const newId = createConnectedValidationNode(nodeId);
      openPanel(newId);
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
            <div className="space-y-4">
              <PipelineResourcePicker
                section="config"
                connectionId={connectionId}
                kind={config.kind}
                resourceId={config.resource_id}
                parameterMappings={config.parameter_mappings}
                inputTable={activeSource?.resolved_table ?? null}
                inputSources={inputSources}
                activeInputSourceId={config.active_input_source_id}
                outputTable={outputTable}
                onChange={handleResourcePickerChange}
              />
              {validateResource.isPending ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Verificando que el recurso
                  existe...
                </p>
              ) : verification ? (
                <p
                  className={
                    verification.exists
                      ? "flex items-center gap-1.5 text-xs text-success"
                      : "flex items-center gap-1.5 text-xs text-destructive"
                  }
                >
                  {verification.exists ? (
                    <CheckCircle2 className="size-3.5" />
                  ) : (
                    <XCircle className="size-3.5" />
                  )}
                  {verification.message}
                </p>
              ) : null}

              <PipelineLogsStream logs={visibleLogs} finalStatus={result?.status} />

              {result ? (
                <div className="space-y-2 rounded-md border p-3">
                  <p
                    className={
                      result.status === "success"
                        ? "text-sm font-medium text-success"
                        : "text-sm font-medium text-destructive"
                    }
                  >
                    {result.status === "success" ? "Ejecucion completada" : "Ejecucion con error"}
                  </p>
                  <p className="text-xs text-muted-foreground">{result.databricks_message}</p>
                  {result.status === "success" ? (
                    <>
                      <p className="font-mono text-xs">
                        Tabla de salida:{" "}
                        <span className="text-foreground">{result.output_table}</span>
                      </p>
                      <Button size="sm" variant="outline" onClick={handleUseOutputInValidation}>
                        <ShieldCheck /> Usar esta salida en un nodo de Validacion
                      </Button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          ),
        },
        {
          value: "parametros",
          label: "Parámetros",
          content: (
            <PipelineResourcePicker
              section="parameters"
              connectionId={connectionId}
              kind={config.kind}
              resourceId={config.resource_id}
              parameterMappings={config.parameter_mappings}
              inputTable={activeSource?.resolved_table ?? null}
              inputSources={inputSources}
              activeInputSourceId={config.active_input_source_id}
              outputTable={outputTable}
              onChange={handleResourcePickerChange}
            />
          ),
        },
        {
          value: "entrada",
          label: "Entrada",
          content: (
            <div className="space-y-2">
              {hasInput ? (
                <>
                  {rows.length >= 2 ? (
                    <p className="text-xs text-muted-foreground">
                      Selecciona qué fuente de entrada se usará al ejecutar el pipeline.
                    </p>
                  ) : null}
                  <PipelineInputSourcesList
                    sources={rows}
                    schemasByTable={schemasByTable}
                    activeSourceId={config.active_input_source_id}
                    onSelectActive={handleSelectActive}
                    onAliasChange={handleRenameSource}
                  />
                </>
              ) : (
                <Alert variant="warning">
                  <TriangleAlert />
                  <AlertTitle>Sin entrada conectada</AlertTitle>
                  <AlertDescription>
                    Conecta un nodo Fuente de datos o Validación en el canvas para continuar.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          ),
        },
      ]}
      actionBar={
        canRun ? (
          <Button className="w-full" onClick={handleRun} disabled={runPipeline.isPending}>
            {runPipeline.isPending ? (
              <>
                <Loader2 className="animate-spin" /> Ejecutando...
              </>
            ) : (
              <>
                <Play /> Ejecutar pipeline
              </>
            )}
          </Button>
        ) : (
          <Alert variant="warning">
            <TriangleAlert />
            <AlertTitle>No se puede ejecutar todavia</AlertTitle>
            <AlertDescription>
              {!hasInput && !hasResource ? (
                <ul className="list-disc pl-4">
                  <li>Conecta al menos un nodo de entrada en el canvas.</li>
                  <li>Selecciona un Job o Pipeline de Databricks.</li>
                </ul>
              ) : !hasInput ? (
                "Conecta al menos un nodo de entrada en el canvas."
              ) : (
                "Selecciona un Job o Pipeline de Databricks."
              )}
            </AlertDescription>
          </Alert>
        )
      }
    />
  );
}

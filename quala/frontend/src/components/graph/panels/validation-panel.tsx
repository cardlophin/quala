import { Copy, FileCode2, Loader2, PlayCircle, Sparkles, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BusinessRulesEditor } from "@/components/graph/business-rules-editor";
import { ConnectedSourcesList } from "@/components/graph/connected-sources-list";
import { NodeConfigDialog } from "@/components/graph/node-config-dialog";
import { useNodeActions } from "@/components/graph/node-actions-context";
import { SourceMetadataSheet } from "@/components/graph/source-metadata-sheet";
import { SqlRulesTable } from "@/components/graph/sql-rules-table";
import { SuggestedRulesPanel } from "@/components/graph/suggested-rules-panel";
import { ValidationFeedbackView } from "@/components/graph/validation-feedback-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useRunValidation } from "@/hooks/use-node-operations";
import { useGenerateSqlRules, useTableSchemas } from "@/hooks/use-tables";
import { resolveSourceAlias } from "@/lib/format";
import type {
  BusinessRuleDraft,
  ConnectedSource,
  QualaNodeData,
  QualaNodeStatus,
  RuleSet,
  ValidationConfig,
  ValidationFeedback,
} from "@/types";

export interface CopyRulesSource {
  nodeId: string;
  label: string;
  rules: BusinessRuleDraft[];
}

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Panel del nodo Validacion (migracion Sheet -> Dialog con pestanas):
 * "Origen de datos" (fuentes conectadas, ver correccion de bugs de
 * alias), "Reglas" (reglas de negocio + sugerencias + generacion de SQL
 * con IA) y "Resultados" (score/KPIs/detalle, con estado vacio antes de
 * ejecutar). El boton final "Ejecutar validacion" vive en la barra de
 * accion fija.
 */
export function ValidationPanel({
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
  copySources,
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
  copySources: CopyRulesSource[];
  onChange: (patch: Partial<QualaNodeData>) => void;
}) {
  const { getIncomingSources } = useNodeActions();
  const config = data.config as unknown as ValidationConfig;
  const result = data.result as ValidationFeedback | undefined;

  const generateSqlRules = useGenerateSqlRules();
  const runValidation = useRunValidation();
  const [copySourceId, setCopySourceId] = React.useState<string | undefined>(undefined);
  const [metadataSource, setMetadataSource] = React.useState<ConnectedSource | null>(null);

  function updateConfig(patch: Partial<ValidationConfig>) {
    const newConfig: ValidationConfig = { ...config, ...patch };
    onChange({ config: newConfig as unknown as Record<string, unknown> });
  }

  // Un nodo Validacion NUNCA resuelve su propia fuente de forma
  // independiente: `connected_sources` se mantiene sincronizado con las
  // aristas de entrada REALES del canvas. El alias VISIBLE nunca se
  // autogenera ni se guarda tal cual -- se calcula siempre con
  // resolveSourceAlias a partir del nombre real de tabla (corrige el bug
  // de alias inventados "datos"/"datos_2"); aqui solo se preserva el
  // `custom_alias` si el usuario ya renombro esta fuente a mano. Las
  // fuentes desconectadas desaparecen de la lista. Esto se actualiza en
  // caliente sin necesidad de cerrar y reabrir el panel.
  const incoming = getIncomingSources(nodeId);
  const incomingKey = JSON.stringify(
    incoming.map((s) => [s.node_id, s.node_type, s.resolvedTable]),
  );
  React.useEffect(() => {
    const existingById = new Map(config.connected_sources.map((s) => [s.node_id, s]));
    const next: ConnectedSource[] = incoming.map((s) => ({
      node_id: s.node_id,
      node_type: s.node_type,
      custom_alias: existingById.get(s.node_id)?.custom_alias,
      resolved_table: s.resolvedTable ?? undefined,
    }));
    const changed =
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
    if (changed) updateConfig({ connected_sources: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingKey]);

  const hasEntrada = config.connected_sources.length > 0;
  const resolvedSources = config.connected_sources.filter(
    (s): s is ConnectedSource & { resolved_table: string } => Boolean(s.resolved_table),
  );
  const resolvedTables = resolvedSources.map((s) => s.resolved_table);
  const schemaQueries = useTableSchemas(resolvedTables, connectionId);

  // Esquema completo de cada fuente (columnas + PK/FK) para las sugerencias
  // con IA — se envía el ESQUEMA, nunca los datos.
  const sourcesForSuggestions = resolvedSources.map((s, i) => ({
    alias: resolveSourceAlias(s, config.connected_sources),
    table: s.resolved_table,
    columns: (schemaQueries[i]?.data?.columns ?? []).map((c) => ({
      name: c.name,
      type: c.data_type,
      is_primary_key: c.is_primary_key,
      is_foreign_key: c.is_foreign_key,
    })),
  }));

  function handleAliasChange(sourceNodeId: string, alias: string) {
    updateConfig({
      connected_sources: config.connected_sources.map((s) =>
        s.node_id === sourceNodeId ? { ...s, custom_alias: alias } : s,
      ),
    });
  }

  function addRule(text: string) {
    updateConfig({
      business_rules: [
        ...config.business_rules,
        { id: uid("rule"), text, source: "manual" },
      ],
    });
  }

  function removeRule(ruleId: string) {
    updateConfig({
      business_rules: config.business_rules.filter((r) => r.id !== ruleId),
    });
  }

  function addSuggestion(text: string) {
    updateConfig({
      business_rules: [
        ...config.business_rules,
        { id: uid("rule"), text, source: "suggested" },
      ],
    });
  }

  // Utilidad manual y opcional: copiar el contenido de otro nodo de
  // Validacion del mismo proyecto. NO es una sincronizacion -- las reglas
  // copiadas quedan como una copia independiente en este nodo.
  function handleCopyRules() {
    const source = copySources.find((s) => s.nodeId === copySourceId);
    if (!source) return;
    const existingTexts = new Set(config.business_rules.map((r) => r.text));
    const toCopy = source.rules
      .filter((r) => !existingTexts.has(r.text))
      .map((r) => ({ ...r, id: uid("rule") }));
    if (toCopy.length === 0) return;
    updateConfig({ business_rules: [...config.business_rules, ...toCopy] });
    setCopySourceId(undefined);
  }

  const existingRuleTexts = config.business_rules.map((r) => r.text);
  const canGenerate = resolvedSources.length > 0 && config.business_rules.length > 0;

  async function handleGenerateSqlRules() {
    if (!connectionId || resolvedSources.length === 0) return;
    const sources = resolvedSources.map((s, i) => ({
      alias: resolveSourceAlias(s, config.connected_sources),
      table: s.resolved_table,
      columns: (schemaQueries[i]?.data?.columns ?? []).map((c) => ({
        name: c.name,
        type: c.data_type,
      })),
    }));
    const ruleSet = await generateSqlRules.mutateAsync({
      connection_id: connectionId,
      node_id: nodeId,
      sources,
      business_rules: config.business_rules.map((r) => r.text),
      context: config.context_prompt?.trim() || undefined,
    });
    updateConfig({ rule_set: ruleSet });
    onChange({ status: "ready" });
  }

  // Editar el SQL generado por la IA antes de ejecutar (seccion 3.1.3): se
  // marca `edited: true` en cuanto el texto difiere de lo que devolvio la
  // IA, para poder distinguir "tal cual lo genero la IA" de "revisado a
  // mano" en la tabla.
  function handleEditSql(ruleName: string, sql: string) {
    if (!config.rule_set) return;
    updateConfig({
      rule_set: {
        rules: config.rule_set.rules.map((r) =>
          r.rule_name === ruleName ? { ...r, sql_query: sql, edited: true } : r,
        ),
      },
    });
  }

  async function handleRunValidation() {
    if (!config.rule_set) return;
    onChange({ status: "running" });
    try {
      const feedback = await runValidation.mutateAsync({
        ruleSet: config.rule_set as RuleSet,
        connectionId,
      });
      // "failed_rules" (ejecuto bien pero alguna regla no se cumple) tambien
      // cuenta como nodo "completado", no como error de nodo -- el error de
      // nodo es solo para fallos de EJECUCION (feedback.status === "error").
      onChange({
        status: feedback.status === "error" ? "error" : "completed",
        result: feedback as unknown as Record<string, unknown>,
      });

      if (feedback.status === "error") {
        toast.error("Error al ejecutar la validación", {
          description: feedback.message ?? "El warehouse no devolvió un mensaje específico.",
        });
      } else if (feedback.status === "failed_rules") {
        toast.warning("Validación ejecutada con incumplimientos", {
          description: `${feedback.passed_rules}/${feedback.evaluated_rules} reglas cumplen · calidad ${feedback.data_quality_score}%`,
        });
      } else {
        toast.success("Validación ejecutada correctamente", {
          description: `${feedback.evaluated_rules} reglas evaluadas · calidad ${feedback.data_quality_score}%`,
        });
      }
    } catch (err) {
      onChange({ status: "error" });
      toast.error("No se pudo ejecutar la validación", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const sqlByRuleName = React.useMemo(
    () =>
      Object.fromEntries(
        (config.rule_set?.rules ?? []).map((r) => [r.rule_name, r.sql_query]),
      ),
    [config.rule_set],
  );

  return (
    <>
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
          value: "origen",
          label: "Origen de datos",
          content: (
            <div className="space-y-2">
              {hasEntrada ? (
                <>
                  <ConnectedSourcesList
                    sources={config.connected_sources}
                    onAliasChange={handleAliasChange}
                    onViewMetadata={setMetadataSource}
                  />
                  {config.connected_sources.length >= 2 ? (
                    <p className="text-xs text-muted-foreground">
                      Este nodo de validacion tiene varias fuentes conectadas. Puedes
                      escribir reglas que relacionen datos entre ellas usando sus alias
                      (ej. "todo orders.customer_id debe existir en clientes.id").
                    </p>
                  ) : null}
                </>
              ) : (
                <Alert variant="warning">
                  <TriangleAlert />
                  <AlertTitle>Sin datos de entrada</AlertTitle>
                  <AlertDescription>
                    Este nodo de validacion no tiene datos de entrada. Conecta una
                    fuente de datos, un generador de sinteticos o un pipeline desde el
                    canvas.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          ),
        },
        {
          value: "reglas",
          label: "Reglas",
          disabled: !hasEntrada,
          content: (
            <div className="space-y-6">
              <div className="space-y-1.5">
                <Label htmlFor="context-prompt">Contexto de los datos (opcional)</Label>
                <Textarea
                  id="context-prompt"
                  value={config.context_prompt ?? ""}
                  onChange={(e) => updateConfig({ context_prompt: e.target.value })}
                  placeholder='Ej: la columna "estado" usa códigos A=activo, B=baja. Las fechas están en UTC.'
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Se envía a la IA junto con las reglas para generar el SQL más
                  fielmente a tus datos.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Label>Reglas de negocio de este nodo</Label>
                  {copySources.length > 0 ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline" size="sm">
                          <Copy /> Copiar reglas de otro nodo
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-72 space-y-3">
                        <Select value={copySourceId} onValueChange={setCopySourceId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Elige un nodo de Validacion" />
                          </SelectTrigger>
                          <SelectContent>
                            {copySources.map((s) => (
                              <SelectItem key={s.nodeId} value={s.nodeId}>
                                {s.label} ({s.rules.length} regla
                                {s.rules.length === 1 ? "" : "s"})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          className="w-full"
                          disabled={!copySourceId}
                          onClick={handleCopyRules}
                        >
                          Copiar reglas
                        </Button>
                      </PopoverContent>
                    </Popover>
                  ) : null}
                </div>

                <BusinessRulesEditor
                  rules={config.business_rules}
                  onAddRule={addRule}
                  onRemoveRule={removeRule}
                />

                <SuggestedRulesPanel
                  sources={sourcesForSuggestions}
                  connectionId={connectionId}
                  existingRuleTexts={existingRuleTexts}
                  onAddSuggestion={addSuggestion}
                />
              </div>

              <div className="space-y-3">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!canGenerate || generateSqlRules.isPending}
                  onClick={handleGenerateSqlRules}
                >
                  {generateSqlRules.isPending ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Sparkles />
                  )}
                  Generar reglas SQL
                </Button>

                {generateSqlRules.isPending ? (
                  <div className="space-y-2">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : config.rule_set && config.rule_set.rules.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 rounded-lg border border-primary/20 border-l-4 border-l-primary bg-primary/5 px-3 py-2">
                      <FileCode2 className="size-4 text-primary" strokeWidth={2} />
                      <span className="text-sm font-semibold">Reglas SQL generadas</span>
                      <Badge variant="secondary" className="ml-auto">
                        {config.rule_set.rules.length}
                      </Badge>
                    </div>
                    <SqlRulesTable
                      rules={config.rule_set.rules}
                      onChangeSql={handleEditSql}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          ),
        },
        {
          value: "resultados",
          label: "Resultados",
          content: runValidation.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : result?.status === "error" ? (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>Error al ejecutar la validacion</AlertTitle>
              <AlertDescription>
                {result.message ?? "La ejecucion no devolvio un mensaje de error especifico."}
              </AlertDescription>
            </Alert>
          ) : result ? (
            <ValidationFeedbackView feedback={result} sqlByRuleName={sqlByRuleName} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Ejecuta la validación para ver resultados.
            </p>
          ),
        },
      ]}
      actionBar={
        config.rule_set ? (
          <Button
            className="w-full"
            onClick={handleRunValidation}
            disabled={runValidation.isPending}
          >
            {runValidation.isPending ? (
              <>
                <Loader2 className="animate-spin" /> Ejecutando...
              </>
            ) : (
              <>
                <PlayCircle /> Ejecutar validación
              </>
            )}
          </Button>
        ) : (
          <Alert variant="warning">
            <TriangleAlert />
            <AlertTitle>No se puede ejecutar todavia</AlertTitle>
            <AlertDescription>
              {!hasEntrada
                ? "Conecta al menos una fuente de datos en el canvas."
                : "Genera las reglas SQL en la pestaña \"Reglas\" antes de ejecutar la validación."}
            </AlertDescription>
          </Alert>
        )
      }
    />
    <SourceMetadataSheet
      open={Boolean(metadataSource)}
      onOpenChange={(open) => !open && setMetadataSource(null)}
      alias={metadataSource ? resolveSourceAlias(metadataSource, config.connected_sources) : null}
      resolvedTable={metadataSource?.resolved_table}
      connectionId={connectionId}
    />
    </>
  );
}

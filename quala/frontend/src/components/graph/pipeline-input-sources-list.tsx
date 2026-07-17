import { ChevronRight, Database, Info, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/graph/status-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { resolveSourceAlias } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ConnectedSource, QualaNodeStatus, QualaNodeType, TableSchemaInfo } from "@/types";

const SOURCE_ICON: Record<QualaNodeType, LucideIcon> = {
  data_source: Database,
  synthetic_generator: Sparkles,
  pipeline: Workflow,
  validation: ShieldCheck,
};

// Etiquetas cortas para el badge de tipo (distintas de NODE_TYPE_LABELS,
// que son mas largas y estan pensadas para otros contextos como selects o
// mensajes de error -- aqui el espacio es reducido, ver seccion C del
// rediseno del panel de Pipeline).
const TYPE_BADGE_LABEL: Record<QualaNodeType, string> = {
  data_source: "Fuente",
  synthetic_generator: "Sintético",
  pipeline: "Pipeline",
  validation: "Validación",
};

export interface PipelineSourceRow extends ConnectedSource {
  status: QualaNodeStatus;
  /** Solo si node_type === "validation": fuentes ORIGINALES de ese nodo de
   * Validacion (leidas de su propio estado, ver getIncomingSources). */
  validationSources?: { alias: string; resolved_table?: string }[];
}

/**
 * Lista de fuentes conectadas a la entrada de un nodo (nacio para la
 * seccion C del rediseno del panel de Pipeline, reutilizada tal cual por
 * SyntheticGeneratorPanel para su "Esquema de referencia" -- mismo shape de
 * fila, sin necesidad de un componente nuevo): puro reflejo de las aristas
 * del canvas -- no permite anadir/quitar fuentes. Cada fila muestra icono
 * por tipo, alias, tabla resuelta (con tooltip de esquema completo) y
 * badges de tipo/estado; las fuentes que son a su vez nodos de Validacion
 * exponen ademas un desplegable local para ver sus fuentes originales, sin
 * llamadas al servidor ni estado persistido -- puramente estado local de
 * UI.
 *
 * El alias se muestra como texto ESTATICO via resolveSourceAlias (mismo
 * helper que ConnectedSourcesList del nodo Validacion, nunca reimplementado
 * por separado): se deriva del ultimo segmento del nombre real de tabla,
 * nunca del label del nodo. Si se pasa `onAliasChange`, cada fila gana un
 * boton "Renombrar" visible al hover, igual que en Validacion.
 *
 * `activeSourceId`/`onSelectActive` son opcionales y solo los usa el
 * Pipeline (problema "no permite elegir cual de varias entradas usar como
 * argumento"): cuando se pasan y hay 2+ fuentes, cada fila gana un radio
 * button a la izquierda para marcar cual es la entrada activa que resuelve
 * los parametros "Desde entrada resultante". Con 0 o 1 fuente no tiene
 * sentido elegir, asi que el control se oculta.
 */
export function PipelineInputSourcesList({
  sources,
  schemasByTable,
  activeSourceId,
  onSelectActive,
  onAliasChange,
}: {
  sources: PipelineSourceRow[];
  schemasByTable: Record<string, TableSchemaInfo | undefined>;
  activeSourceId?: string | null;
  onSelectActive?: (nodeId: string) => void;
  onAliasChange?: (nodeId: string, alias: string) => void;
}) {
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const showSelector = Boolean(onSelectActive) && sources.length >= 2;

  function toggleExpanded(nodeId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }

  function startEditing(source: PipelineSourceRow) {
    setDraft(resolveSourceAlias(source, sources));
    setEditingId(source.node_id);
  }

  function confirm(source: PipelineSourceRow) {
    const trimmed = draft.trim();
    if (trimmed) onAliasChange?.(source.node_id, trimmed);
    setEditingId(null);
  }

  return (
    <div className="space-y-2.5">
      {sources.map((source) => {
        const Icon = SOURCE_ICON[source.node_type];
        const schema = source.resolved_table ? schemasByTable[source.resolved_table] : undefined;
        const isValidationSource = source.node_type === "validation";
        const originalSources = source.validationSources ?? [];
        const isExpanded = expanded.has(source.node_id);
        const isActive = source.node_id === activeSourceId;
        const isEditing = editingId === source.node_id;
        const alias = resolveSourceAlias(source, sources);

        return (
          <div
            key={source.node_id}
            className="group space-y-2 rounded-md border bg-muted/30 px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              {showSelector ? (
                <button
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  aria-label={`Usar ${alias} como entrada activa`}
                  onClick={() => onSelectActive?.(source.node_id)}
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-full border",
                    isActive
                      ? "border-primary"
                      : "border-muted-foreground/40 hover:border-muted-foreground",
                  )}
                >
                  {isActive ? <span className="size-2 rounded-full bg-primary" /> : null}
                </button>
              ) : null}
              <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
              {isEditing ? (
                <Input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => confirm(source)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    else if (e.key === "Escape") setEditingId(null);
                  }}
                  className="h-7 w-32 shrink-0 text-xs"
                  aria-label="Alias de la fuente"
                />
              ) : (
                <>
                  <span className="truncate text-sm font-medium">{alias}</span>
                  {onAliasChange ? (
                    <button
                      type="button"
                      onClick={() => startEditing(source)}
                      className="shrink-0 text-[11px] text-muted-foreground underline decoration-dotted opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                    >
                      Renombrar
                    </button>
                  ) : null}
                </>
              )}
              <div className="min-w-0 flex-1" />
              {source.resolved_table ? (
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {source.resolved_table}
                </span>
              ) : (
                <span className="shrink-0 text-xs italic text-muted-foreground">
                  Sin tabla
                </span>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label="Ver esquema"
                  >
                    <Info className="size-3.5" strokeWidth={1.5} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-72">
                  {!source.resolved_table ? (
                    <p>Esta fuente todavia no resuelve ninguna tabla.</p>
                  ) : schema ? (
                    <div className="space-y-1">
                      <p className="font-medium">{schema.full_name}</p>
                      <ul className="space-y-0.5">
                        {schema.columns.map((c) => (
                          <li
                            key={c.name}
                            className="flex items-center justify-between gap-4 font-mono text-[11px]"
                          >
                            <span>{c.name}</span>
                            <span className="opacity-70">{c.data_type}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p>Cargando esquema...</p>
                  )}
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="text-[10px]">
                {TYPE_BADGE_LABEL[source.node_type]}
              </Badge>
              <StatusBadge status={source.status} />
            </div>

            {isValidationSource ? (
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => toggleExpanded(source.node_id)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ChevronRight
                    className={cn("size-3.5 transition-transform", isExpanded && "rotate-90")}
                    strokeWidth={1.5}
                  />
                  Ver fuentes de entrada originales ({originalSources.length})
                </button>
                {isExpanded ? (
                  <ul className="space-y-1 pl-5">
                    {originalSources.map((s, i) => (
                      <li key={`${source.node_id}_${i}`} className="text-xs text-muted-foreground">
                        {s.alias} → {s.resolved_table ?? "Sin tabla"}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

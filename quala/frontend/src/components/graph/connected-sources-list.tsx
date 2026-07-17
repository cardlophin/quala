import { Database, Info, ShieldCheck, Wand2, Workflow } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NODE_TYPE_LABELS } from "@/lib/graph-rules";
import { resolveSourceAlias } from "@/lib/format";
import type { ConnectedSource, QualaNodeType } from "@/types";

const SOURCE_ICON: Record<QualaNodeType, LucideIcon> = {
  data_source: Database,
  synthetic_generator: Wand2,
  pipeline: Workflow,
  validation: ShieldCheck,
};

/**
 * Lista de fuentes conectadas a la entrada de un nodo Validacion (seccion
 * 2 de la correccion de bugs de paneles): tipo de nodo origen, tabla
 * resuelta (o "Pendiente de ejecucion"), badge de posible duplicado si dos
 * fuentes resuelven a la misma tabla, y boton "Ver metadata" que abre el
 * detalle de esquema/preview de esa fuente en un Sheet aparte (ver
 * SourceMetadataSheet). Esta lista es un reflejo de las aristas del canvas
 * -- no permite anadir/quitar fuentes.
 *
 * El alias se muestra como texto ESTATICO (resolveSourceAlias, derivado
 * del nombre real de tabla -- ya no del label del nodo, que era la causa
 * del bug "datos"/"datos_2"), nunca como un Input siempre editable: el
 * renombrado manual solo se activa con el boton explicito "Renombrar",
 * visible al pasar el mouse por la fila.
 */
export function ConnectedSourcesList({
  sources,
  onAliasChange,
  onViewMetadata,
}: {
  sources: ConnectedSource[];
  onAliasChange: (nodeId: string, alias: string) => void;
  onViewMetadata: (source: ConnectedSource) => void;
}) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");

  const tableCounts = new Map<string, number>();
  for (const s of sources) {
    if (s.resolved_table) {
      tableCounts.set(s.resolved_table, (tableCounts.get(s.resolved_table) ?? 0) + 1);
    }
  }

  function startEditing(source: ConnectedSource) {
    setDraft(resolveSourceAlias(source, sources));
    setEditingId(source.node_id);
  }

  function confirm(source: ConnectedSource) {
    const trimmed = draft.trim();
    if (trimmed) onAliasChange(source.node_id, trimmed);
    setEditingId(null);
  }

  return (
    <div className="space-y-2">
      {sources.map((source) => {
        const Icon = SOURCE_ICON[source.node_type];
        const isDuplicate = Boolean(
          source.resolved_table && (tableCounts.get(source.resolved_table) ?? 0) > 1,
        );
        const isEditing = editingId === source.node_id;
        const alias = resolveSourceAlias(source, sources);

        return (
          <div
            key={source.node_id}
            className="group flex items-center gap-2 rounded-md border px-3 py-2"
          >
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
                <span className="shrink-0 text-xs font-medium">{alias}</span>
                <button
                  type="button"
                  onClick={() => startEditing(source)}
                  className="shrink-0 text-[11px] text-muted-foreground underline decoration-dotted opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                >
                  Renombrar
                </button>
              </>
            )}
            <span className="shrink-0 text-xs text-muted-foreground">
              {NODE_TYPE_LABELS[source.node_type]}
            </span>
            {isDuplicate ? (
              <Badge variant="warning" className="shrink-0 text-[10px]">
                posible duplicado
              </Badge>
            ) : null}
            <span className="min-w-0 flex-1 truncate text-right font-mono text-xs">
              {source.resolved_table ?? (
                <span className="text-muted-foreground">Pendiente de ejecucion</span>
              )}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              onClick={() => onViewMetadata(source)}
              aria-label="Ver metadata"
            >
              <Info className="size-4" strokeWidth={1.5} />
            </Button>
          </div>
        );
      })}
    </div>
  );
}

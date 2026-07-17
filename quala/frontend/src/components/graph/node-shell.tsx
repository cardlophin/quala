import { Handle, Position } from "@xyflow/react";
import type { LucideIcon } from "lucide-react";
import { Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { NODE_IDENTITY_VAR } from "./node-identity";
import type { QualaNodeStatus, QualaNodeType } from "@/types";

const STATUS_LABEL: Record<QualaNodeStatus, string> = {
  pending: "Pendiente",
  configuring: "Configurando",
  ready: "Listo",
  running: "Ejecutando",
  completed: "Completado",
  error: "Error",
};

// Solo los estados "transitorios" (ejecutando/error) usan colores
// universales (amber/rojo) en todos los tipos de nodo -- son una señal de
// alerta que no debe competir con la identidad de color del nodo. Los
// demas estados usan variantes neutras salvo "listo"/"completado", que se
// pintan con el color de identidad del propio nodo (ver renderStatusBadge).
const UNIVERSAL_STATUS_VARIANT: Partial<
  Record<QualaNodeStatus, "outline" | "secondary" | "warning" | "destructive">
> = {
  pending: "outline",
  configuring: "secondary",
  running: "warning",
  error: "destructive",
};

interface NodeShellProps {
  icon: LucideIcon;
  title: string;
  status: QualaNodeStatus;
  nodeType: QualaNodeType;
  summary?: React.ReactNode;
  hasInput?: boolean;
  hasOutput?: boolean;
  /** El handle de entrada esta vacio y el nodo se beneficia de tener algo conectado ahi. */
  inputWarning?: boolean;
  /** Mensaje del tooltip del handle de entrada, generado dinamicamente desde graph-rules.ts (COMPATIBILITY) para que nunca quede desincronizado de la logica real. */
  inputWarningMessage?: string;
  /** Resultado de la ultima verificacion manual ("Verificar conexiones" en
   * la topbar del canvas, ver seccion 6 del refactor de grafo): un punto
   * verde/rojo junto al titulo, con el mensaje literal en el tooltip. Solo
   * lo pasan los nodos "pipeline" y "data_source". */
  verification?: { ok: boolean; message: string };
  selected?: boolean;
  onOpen: () => void;
}

/**
 * Envoltorio visual comun a todos los nodos del canvas: encabezado con
 * icono + titulo + Badge de estado, boton para abrir el panel de
 * configuracion (Sheet), resumen colapsado, y handles de entrada/salida.
 * El nodo esta "colapsado" por defecto -- expandir = abrir el panel, no
 * hay un toggle de expansion dentro del propio nodo.
 *
 * Cada tipo de nodo tiene una identidad de color propia (borde superior,
 * fondo del icono, badge de estado "listo"/"completado") definida via la
 * variable CSS de `NODE_IDENTITY_VAR`, para que el grafo sea legible de un
 * vistazo sin leer el titulo de cada nodo.
 */
export function NodeShell({
  icon: Icon,
  title,
  status,
  nodeType,
  summary,
  hasInput,
  hasOutput,
  inputWarning,
  inputWarningMessage,
  verification,
  selected,
  onOpen,
}: NodeShellProps) {
  const identityVar = NODE_IDENTITY_VAR[nodeType];
  const identityColor = `var(${identityVar})`;
  const identityForeground = `var(${identityVar}-foreground)`;
  const isIdentityBadge = status === "ready" || status === "completed";

  return (
    <div
      onDoubleClick={onOpen}
      style={{ borderTopColor: identityColor }}
      className={cn(
        "w-64 rounded-lg border-t-4 border bg-card text-card-foreground shadow-sm transition-shadow",
        selected ? "ring-2 ring-ring shadow-md" : "hover:shadow-md",
      )}
    >
      {hasInput ? (
        inputWarning ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Handle
                type="target"
                position={Position.Left}
                className="!size-3 !animate-pulse !border-2 !border-warning !bg-warning"
              />
            </TooltipTrigger>
            <TooltipContent side="left">{inputWarningMessage}</TooltipContent>
          </Tooltip>
        ) : (
          <Handle type="target" position={Position.Left} className="!size-3" />
        )
      ) : null}

      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-full"
          style={{
            backgroundColor: `color-mix(in oklch, ${identityColor} 18%, transparent)`,
          }}
        >
          <Icon
            className="size-3.5"
            strokeWidth={1.75}
            style={{ color: identityColor }}
          />
        </span>
        <span className="flex-1 truncate text-sm font-medium">{title}</span>
        {verification ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  verification.ok ? "bg-success" : "bg-destructive",
                )}
              />
            </TooltipTrigger>
            <TooltipContent side="top">{verification.message}</TooltipContent>
          </Tooltip>
        ) : null}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          aria-label="Configurar nodo"
          className="rounded-sm p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Settings2 className="size-3.5" strokeWidth={1.5} />
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 px-3 pb-2.5">
        {isIdentityBadge ? (
          <Badge
            className="border-transparent text-[10px]"
            style={{ backgroundColor: identityColor, color: identityForeground }}
          >
            {STATUS_LABEL[status]}
          </Badge>
        ) : (
          <Badge variant={UNIVERSAL_STATUS_VARIANT[status]} className="text-[10px]">
            {STATUS_LABEL[status]}
          </Badge>
        )}
      </div>

      {summary ? (
        <div className="border-t px-3 py-2 text-xs text-muted-foreground">
          {summary}
        </div>
      ) : null}

      {hasOutput ? (
        <Handle type="source" position={Position.Right} className="!size-3" />
      ) : null}
    </div>
  );
}

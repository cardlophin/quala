import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QualaNodeStatus } from "@/types";

const STATUS_LABEL: Record<QualaNodeStatus, string> = {
  pending: "Pendiente",
  configuring: "Configurando",
  ready: "Listo",
  running: "Ejecutando",
  completed: "Completado",
  error: "Error",
};

type StatusKind = "pending" | "ready" | "error";

// Los 6 estados de QualaNodeStatus se agrupan en 3 familias visuales: todo
// lo "en curso" (pendiente/configurando/ejecutando) se pinta ambar con un
// punto pulsante, todo lo "resuelto favorablemente" (listo/completado) se
// pinta verde con un check, y el error se pinta rojo con una X.
const STATUS_KIND: Record<QualaNodeStatus, StatusKind> = {
  pending: "pending",
  configuring: "pending",
  running: "pending",
  ready: "ready",
  completed: "ready",
  error: "error",
};

/**
 * Badge de estado unificado (borde de color + icono/punto en vez de
 * relleno solido), pensado para reemplazar el Badge de relleno solido
 * usado antes en el header del panel de nodo (ver rediseno del panel de
 * Pipeline, seccion A) y para reutilizarse en cualquier lista que muestre
 * el estado de un nodo origen (ej. "Entrada del pipeline", seccion C).
 */
export function StatusBadge({
  status,
  className,
}: {
  status: QualaNodeStatus;
  className?: string;
}) {
  const kind = STATUS_KIND[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        // "-foreground" solo hace falta para warning: ese token es oscuro
        // (pensado para texto sobre su propio fondo tintado, ver
        // ui/alert.tsx). success-foreground/destructive-foreground son
        // casi blancos (pensados para texto sobre relleno SOLIDO, ver
        // ui/badge.tsx variant="success"/"destructive"), asi que aqui se
        // usa directamente el tono base para que el texto siga siendo
        // legible sobre fondo transparente/claro.
        kind === "pending" && "border-warning/50 text-warning-foreground",
        kind === "ready" && "border-success/50 text-success",
        kind === "error" && "border-destructive/50 text-destructive",
        className,
      )}
    >
      {kind === "pending" ? (
        <span className="size-1.5 animate-pulse rounded-full bg-warning" />
      ) : kind === "ready" ? (
        <Check className="size-3" strokeWidth={2} />
      ) : (
        <X className="size-3" strokeWidth={2} />
      )}
      {STATUS_LABEL[status]}
    </span>
  );
}

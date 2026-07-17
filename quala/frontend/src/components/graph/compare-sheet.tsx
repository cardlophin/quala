import { GitCompare } from "lucide-react";
import * as React from "react";
import { ValidationFeedbackView } from "@/components/graph/validation-feedback-view";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ValidationFeedback } from "@/types";

export interface CompareCandidate {
  nodeId: string;
  label: string;
  feedback: ValidationFeedback;
}

/**
 * Comparador generalizado: cualquier par de nodos de "Validacion" del
 * grafo que ya tengan resultados se puede comparar entre si (por ejemplo,
 * validacion de entrada vs. validacion de salida de un mismo pipeline).
 * Sustituye al comparador especifico "sintetico vs. real" de la iteracion
 * anterior.
 */
export function CompareSheet({
  open,
  onOpenChange,
  candidates,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: CompareCandidate[];
}) {
  const [leftId, setLeftId] = React.useState<string | undefined>(candidates[0]?.nodeId);
  const [rightId, setRightId] = React.useState<string | undefined>(
    candidates[1]?.nodeId,
  );

  React.useEffect(() => {
    if (!open) return;
    if (!candidates.some((c) => c.nodeId === leftId)) {
      setLeftId(candidates[0]?.nodeId);
    }
    if (!candidates.some((c) => c.nodeId === rightId)) {
      setRightId(candidates[1]?.nodeId);
    }
    // Solo al abrir / cuando cambian los candidatos disponibles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, candidates]);

  const left = candidates.find((c) => c.nodeId === leftId);
  const right = candidates.find((c) => c.nodeId === rightId);
  const scoreDelta =
    left && right ? right.feedback.data_quality_score - left.feedback.data_quality_score : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-4xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <GitCompare className="size-4.5" strokeWidth={1.5} />
            Comparar resultados de validacion
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 pb-6">
          <div className="grid grid-cols-2 gap-4">
            <Select value={leftId} onValueChange={setLeftId}>
              <SelectTrigger>
                <SelectValue placeholder="Nodo A" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((c) => (
                  <SelectItem key={c.nodeId} value={c.nodeId}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={rightId} onValueChange={setRightId}>
              <SelectTrigger>
                <SelectValue placeholder="Nodo B" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((c) => (
                  <SelectItem key={c.nodeId} value={c.nodeId}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {scoreDelta !== null ? (
            <p className="text-sm text-muted-foreground">
              Diferencia de score:{" "}
              <span
                className={
                  scoreDelta === 0
                    ? "text-foreground"
                    : scoreDelta > 0
                      ? "text-success"
                      : "text-destructive"
                }
              >
                {scoreDelta > 0 ? "+" : ""}
                {scoreDelta} pts
              </span>
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium">{left?.label ?? "Selecciona un nodo"}</p>
              {left ? <ValidationFeedbackView feedback={left.feedback} /> : null}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">{right?.label ?? "Selecciona un nodo"}</p>
              {right ? <ValidationFeedbackView feedback={right.feedback} /> : null}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

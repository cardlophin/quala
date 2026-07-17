import { Sparkles, X } from "lucide-react";
import type { BusinessRuleDraft } from "@/types";

/** Una regla de negocio dentro de la lista de un nodo de Validacion. */
export function RuleChip({
  rule,
  onRemove,
}: {
  rule: BusinessRuleDraft;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
      <span className="flex items-center gap-2">
        {rule.source === "suggested" ? (
          <Sparkles
            className="size-3.5 shrink-0 text-category-pipeline"
            strokeWidth={1.5}
          />
        ) : null}
        {rule.text}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Quitar regla"
        className="text-muted-foreground hover:text-destructive"
      >
        <X className="size-4" />
      </button>
    </li>
  );
}

import { Loader2, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSuggestRulesAi, type AiSchemaSource } from "@/hooks/use-tables";

/**
 * Sugerencias de reglas con IA para un nodo de Validación, SIEMPRE a partir
 * del ESQUEMA (columnas + PK/FK + relaciones) de las fuentes conectadas a
 * ESE nodo — nunca de los datos. Se disparan MANUALMENTE con un botón (no
 * automáticamente): el usuario decide cuándo llamar a la IA.
 */
export function SuggestedRulesPanel({
  sources,
  connectionId,
  existingRuleTexts,
  onAddSuggestion,
}: {
  sources: AiSchemaSource[];
  connectionId?: string | null;
  existingRuleTexts: string[];
  onAddSuggestion: (text: string) => void;
}) {
  const suggest = useSuggestRulesAi();
  const suggestions = suggest.data ?? [];
  const remaining = suggestions.filter((s) => !existingRuleTexts.includes(s.text));

  if (sources.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Conecta al menos una fuente de datos para poder sugerir reglas basadas en su
        esquema.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={suggest.isPending}
        onClick={() => suggest.mutate({ sources, connectionId })}
      >
        {suggest.isPending ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Sparkles />
        )}
        Sugerir reglas con IA
      </Button>

      <p className="text-xs text-muted-foreground">
        Analiza el esquema y las relaciones de tus tablas (sin leer los datos) para
        proponer reglas de calidad.
      </p>

      {suggest.isError ? (
        <p className="text-xs text-destructive">
          No se pudieron generar sugerencias:{" "}
          {suggest.error instanceof Error ? suggest.error.message : "error desconocido"}
        </p>
      ) : null}

      {remaining.length > 0 ? (
        <div className="space-y-1.5 pt-1">
          {remaining.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onAddSuggestion(s.text)}
              className="flex w-full items-start gap-2 rounded-lg border border-dashed px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground"
            >
              <Plus className="mt-0.5 size-3 shrink-0" />
              <span className="min-w-0 flex-1 break-words">{s.text}</span>
            </button>
          ))}
        </div>
      ) : suggest.isSuccess ? (
        <p className="text-xs text-muted-foreground">
          No hay nuevas sugerencias (o ya las añadiste todas).
        </p>
      ) : null}
    </div>
  );
}

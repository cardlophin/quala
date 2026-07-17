import { Plus } from "lucide-react";
import * as React from "react";
import { RuleChip } from "@/components/graph/rule-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BusinessRuleDraft } from "@/types";

/**
 * Editor de reglas de negocio de UN nodo de Validacion concreto. Cada nodo
 * gestiona su propio conjunto de reglas (ya no hay una libreria compartida
 * a nivel de proyecto): anadir aqui agrega la regla directamente a este
 * nodo, quitar la elimina de este nodo. Para reutilizar reglas entre dos
 * nodos existe una utilidad manual aparte ("Copiar reglas de otro nodo",
 * ver validation-panel.tsx), no una sincronizacion automatica.
 */
export function BusinessRulesEditor({
  rules,
  onAddRule,
  onRemoveRule,
}: {
  rules: BusinessRuleDraft[];
  onAddRule: (text: string) => void;
  onRemoveRule: (ruleId: string) => void;
}) {
  const [input, setInput] = React.useState("");

  function submit() {
    const text = input.trim();
    if (!text) return;
    onAddRule(text);
    setInput("");
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="Ej: el email del cliente debe ser unico"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Button type="button" variant="secondary" onClick={submit}>
          <Plus /> Anadir
        </Button>
      </div>

      {rules.length > 0 ? (
        <ul className="divide-y divide-border rounded-md border">
          {rules.map((rule) => (
            <RuleChip key={rule.id} rule={rule} onRemove={() => onRemoveRule(rule.id)} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Todavia no has anadido ninguna regla a este nodo.
        </p>
      )}
    </div>
  );
}

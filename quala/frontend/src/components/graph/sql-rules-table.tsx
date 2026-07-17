import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import type { SQLRule } from "@/types";

/**
 * Lista desplegable (acordeón) de reglas + SQL generado por la IA, editable
 * antes de ejecutar. La cabecera muestra la regla en lenguaje natural
 * truncada (para no romper la armonía visual cuando es larga); al desplegar
 * se ve la regla completa y el SQL editable. Cada regla marca "editado" si
 * el SQL difiere del que generó la IA.
 */
export function SqlRulesTable({
  rules,
  onChangeSql,
}: {
  rules: SQLRule[];
  onChangeSql: (ruleName: string, sql: string) => void;
}) {
  return (
    <div className="rounded-xl border">
      <Accordion type="multiple" className="w-full">
        {rules.map((rule) => (
          <AccordionItem key={rule.rule_name} value={rule.rule_name} className="px-3">
            <AccordionTrigger className="items-center gap-2 overflow-hidden hover:no-underline">
              <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                <span className="min-w-0 flex-1 truncate text-sm">{rule.business_rule}</span>
                {rule.edited ? (
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    editado
                  </Badge>
                ) : null}
                {!rule.translatable ? (
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    no traducible
                  </Badge>
                ) : null}
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-2">
              <p className="text-xs break-words text-muted-foreground">{rule.business_rule}</p>
              {rule.translatable ? (
                <Textarea
                  value={rule.sql_query ?? ""}
                  onChange={(e) => onChangeSql(rule.rule_name, e.target.value)}
                  rows={4}
                  className="font-mono text-xs"
                />
              ) : (
                <p className="rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
                  {rule.reason ?? "La IA no pudo traducir esta regla a SQL."}
                </p>
              )}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

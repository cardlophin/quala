import { Eye } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RuleDetailSheet } from "@/components/graph/rule-detail-sheet";
import { cn } from "@/lib/utils";
import type { RuleVerdict, ValidationFeedback } from "@/types";

function scoreColorClass(score: number) {
  if (score > 85) return "text-success";
  if (score >= 60) return "text-warning";
  return "text-destructive";
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3 text-center">
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/**
 * Resultado de validacion: gauge de score (simplificado como numero +
 * barra), KPIs, tabla de reglas con veredicto y un `RuleDetailSheet`
 * apilado por regla con el SQL evaluado + la muestra de filas invalidas.
 * Se usa dentro del panel del nodo de validacion y en el comparador entre
 * dos nodos.
 */
export function ValidationFeedbackView({
  feedback,
  sqlByRuleName,
}: {
  feedback: ValidationFeedback;
  /** SQL evaluado por regla (opcional): permite al RuleDetailSheet mostrar
   * la consulta real, no solo la muestra de filas. Viene del `rule_set`
   * generado en el propio panel del nodo. */
  sqlByRuleName?: Record<string, string | null>;
}) {
  const [selected, setSelected] = React.useState<RuleVerdict | null>(null);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium">Score de calidad de dato</p>
          <span
            className={cn(
              "text-2xl font-semibold",
              scoreColorClass(feedback.data_quality_score),
            )}
          >
            {feedback.data_quality_score}%
          </span>
        </div>
        <Progress value={feedback.data_quality_score} />
      </div>

      <div className="grid grid-cols-4 gap-2">
        <KpiCard label="Reglas" value={feedback.total_rules} />
        <KpiCard label="Evaluadas" value={feedback.evaluated_rules} />
        <KpiCard label="Pasadas" value={feedback.passed_rules} />
        <KpiCard label="Omitidas" value={feedback.skipped_rules} />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead>Regla</TableHead>
              <TableHead>Veredicto</TableHead>
              <TableHead>Filas invalidas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {feedback.verdicts.map((verdict) => {
              const invalidRows = feedback.sample_invalid_rows[verdict.rule_name] ?? [];
              const hasDetail = (verdict.failed_rows ?? 0) > 0 && invalidRows.length > 0;
              return (
                <TableRow key={verdict.rule_name}>
                  <TableCell>
                    {hasDetail ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setSelected(verdict)}
                        aria-label="Ver filas invalidas"
                      >
                        <Eye className="size-4" strokeWidth={1.5} />
                      </Button>
                    ) : null}
                  </TableCell>
                  <TableCell className="max-w-64 truncate text-sm">
                    {verdict.business_rule}
                  </TableCell>
                  <TableCell>
                    {verdict.skipped_reason ? (
                      <Badge variant="outline">omitida</Badge>
                    ) : verdict.passed ? (
                      <Badge variant="success">pasa</Badge>
                    ) : (
                      <Badge variant="destructive">falla</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {verdict.failed_rows ?? "-"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <RuleDetailSheet
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
        verdict={selected}
        invalidRows={selected ? (feedback.sample_invalid_rows[selected.rule_name] ?? []) : []}
        sqlQuery={selected ? (sqlByRuleName?.[selected.rule_name] ?? null) : null}
      />
    </div>
  );
}

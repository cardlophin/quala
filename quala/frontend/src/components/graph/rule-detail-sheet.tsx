import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RuleVerdict } from "@/types";

/**
 * Detalle de una regla concreta tras ejecutar una validacion (seccion
 * 3.1.4 del refactor de paneles de nodo): se apila sobre el Sheet
 * principal del nodo de Validacion en vez de expandir la fila inline,
 * para dejar sitio a mostrar el SQL evaluado + todas las filas invalidas
 * sin apretujar la tabla de reglas.
 */
export function RuleDetailSheet({
  open,
  onOpenChange,
  verdict,
  invalidRows,
  sqlQuery,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  verdict: RuleVerdict | null;
  invalidRows: Record<string, unknown>[];
  sqlQuery?: string | null;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{verdict?.business_rule ?? "Detalle de la regla"}</SheetTitle>
          <SheetDescription>
            {verdict?.skipped_reason
              ? verdict.skipped_reason
              : verdict?.passed
                ? "Esta regla se cumple en todas las filas evaluadas."
                : `${verdict?.failed_rows ?? 0} fila(s) incumplen esta regla.`}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 pb-6">
          {verdict ? (
            <div className="flex items-center gap-2">
              {verdict.skipped_reason ? (
                <Badge variant="outline">omitida</Badge>
              ) : verdict.passed ? (
                <Badge variant="success">pasa</Badge>
              ) : (
                <Badge variant="destructive">falla</Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {verdict.success_condition}
              </span>
            </div>
          ) : null}

          {sqlQuery ? (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">SQL evaluado</p>
              <pre className="overflow-x-auto rounded-md border bg-muted p-3 font-mono text-xs">
                {sqlQuery}
              </pre>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <p className="text-sm font-medium">Filas invalidas</p>
            {invalidRows.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No hay una muestra de filas invalidas disponible para esta regla.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {Object.keys(invalidRows[0] ?? {}).map((key) => (
                        <TableHead key={key}>{key}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invalidRows.map((row, i) => (
                      <TableRow key={i}>
                        {Object.values(row).map((value, j) => (
                          <TableCell key={j}>{String(value)}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

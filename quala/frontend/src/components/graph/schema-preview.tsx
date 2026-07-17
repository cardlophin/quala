import { KeyRound, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTablePreviewRows, useTableSchema } from "@/hooks/use-tables";

/**
 * Esquema + preview de filas de una tabla. Usado por el nodo "Fuente de
 * datos" (tabla elegida directamente) y por el nodo "Validacion" (tabla
 * heredada del nodo conectado aguas arriba, en modo solo lectura).
 */
export function SchemaPreview({
  fullName,
  connectionId,
}: {
  fullName: string;
  connectionId?: string | null;
}) {
  const { data: schema, isLoading: loadingSchema } = useTableSchema(fullName, connectionId);
  const { data: rows, isLoading: loadingRows } = useTablePreviewRows(fullName, connectionId);

  if (loadingSchema || loadingRows) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
      </div>
    );
  }

  if (!schema) return null;

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-sm font-medium">
          Esquema
          {typeof schema.row_count === "number" ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {schema.row_count.toLocaleString("es-ES")} filas
            </span>
          ) : null}
        </p>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Columna</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Nullable</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {schema.columns.map((col) => (
                <TableRow key={col.name}>
                  <TableCell className="font-medium">{col.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {col.data_type}
                  </TableCell>
                  <TableCell>
                    {col.nullable ? (
                      <Badge variant="outline">nullable</Badge>
                    ) : (
                      <Badge variant="secondary">not null</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {col.is_primary_key ? (
                        <KeyRound
                          className="size-3.5 text-category-pipeline"
                          strokeWidth={1.5}
                        />
                      ) : null}
                      {col.is_foreign_key ? (
                        <Link2
                          className="size-3.5 text-category-data"
                          strokeWidth={1.5}
                        />
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Preview de filas</p>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {schema.columns.map((col) => (
                  <TableHead key={col.name}>{col.name}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows ?? []).map((row, i) => (
                <TableRow key={i}>
                  {schema.columns.map((col) => (
                    <TableCell key={col.name}>
                      {String(row[col.name] ?? "")}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

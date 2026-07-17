import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SchemaPreview } from "@/components/graph/schema-preview";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * Metadata (esquema + preview de filas) de UNA fuente conectada al nodo de
 * Validacion, apilada sobre el panel principal (seccion 3 de la
 * correccion de bugs de paneles): puramente informativa/exploratoria, ya
 * no es un bloque siempre visible del flujo principal. Reutiliza
 * SchemaPreview sin cambios internos, solo cambia donde/cuando se invoca.
 */
export function SourceMetadataSheet({
  open,
  onOpenChange,
  alias,
  resolvedTable,
  connectionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alias: string | null;
  resolvedTable: string | null | undefined;
  connectionId?: string | null;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Metadata: {alias}</SheetTitle>
          <SheetDescription>
            {resolvedTable ?? "Esta fuente todavia no resuelve ninguna tabla."}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 pb-6">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            <ArrowLeft /> Volver
          </Button>
          {resolvedTable ? (
            <SchemaPreview fullName={resolvedTable} connectionId={connectionId} />
          ) : (
            <p className="text-sm text-muted-foreground">
              El nodo origen todavia no ha generado una tabla de salida (ej. un
              pipeline o un generador de sinteticos sin ejecutar todavia).
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

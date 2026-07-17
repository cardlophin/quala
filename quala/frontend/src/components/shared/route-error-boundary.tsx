import { AlertTriangle } from "lucide-react";
import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { Button } from "@/components/ui/button";

/**
 * errorElement a nivel de router. Sin esto, un error de render dentro de
 * una ruta (por ejemplo un bucle de renders infinito, o cualquier throw)
 * quedaba silenciosamente "congelado" en pantalla sin ningun mensaje —
 * la unica pista era que la URL cambiaba pero el contenido no. Con esto,
 * cualquier fallo futuro se ve inmediatamente en vez de parecer un bug
 * de navegacion.
 */
export function RouteErrorBoundary() {
  const error = useRouteError();

  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "Ha ocurrido un error inesperado.";

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <AlertTriangle className="size-10 text-destructive" strokeWidth={1.5} />
      <div className="space-y-1">
        <p className="font-medium">Algo ha fallado al cargar esta pagina</p>
        <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      </div>
      <Button onClick={() => window.location.assign("/projects")}>
        Volver a proyectos
      </Button>
    </div>
  );
}

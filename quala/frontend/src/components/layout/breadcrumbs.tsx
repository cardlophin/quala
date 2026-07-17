import type { LucideIcon } from "lucide-react";
import { Fragment } from "react";
import { Link, useLocation } from "react-router-dom";

// Ya no hay subrutas de wizard (planner/pipeline/validation/results/
// compare): /projects/:id es directamente el canvas del proyecto, sin
// hijos.
const LABELS: Record<string, string> = {
  projects: "Proyectos",
  connections: "Conexiones",
  history: "Historial",
  settings: "Ajustes",
  new: "Nuevo proyecto",
};

const ICONS: Partial<Record<string, LucideIcon>> = {};

/** Breadcrumbs derivados automaticamente de la ruta actual. */
export function Breadcrumbs() {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  return (
    <nav aria-label="breadcrumb" className="flex items-center gap-1.5 text-sm">
      {segments.map((segment, i) => {
        const href = "/" + segments.slice(0, i + 1).join("/");
        const isLast = i === segments.length - 1;
        const knownLabel = LABELS[segment];
        // Un segmento desconocido justo despues de "projects" es el :id de
        // un proyecto: ahora SI tiene ruta propia (pagina resumen del
        // proyecto en /projects/:id), asi que puede enlazar ahi. Cualquier
        // otro segmento desconocido se muestra como texto plano para
        // evitar 404s.
        const isProjectId = i > 0 && segments[i - 1] === "projects";
        const label = knownLabel ?? (isProjectId ? "Proyecto" : segment);
        const Icon = ICONS[segment];
        const isLinkable = (Boolean(knownLabel) || isProjectId) && !isLast;

        return (
          <Fragment key={href}>
            {i > 0 ? <span className="text-muted-foreground">/</span> : null}
            {isLinkable ? (
              <Link
                to={href}
                className="text-muted-foreground hover:text-foreground"
              >
                {label}
              </Link>
            ) : isLast ? (
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                {Icon ? <Icon className="size-3.5" strokeWidth={1.5} /> : null}
                {label}
              </span>
            ) : (
              <span className="text-muted-foreground">{label}</span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

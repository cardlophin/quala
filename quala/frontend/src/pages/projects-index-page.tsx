import { Plus, Search } from "lucide-react";
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { CardGridSkeleton } from "@/components/shared/card-grid-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { ProjectCard } from "@/components/shared/project-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTopbarActions } from "@/components/layout/topbar-slot";
import { useProjects } from "@/hooks/use-projects";

export function ProjectsIndexPage() {
  const navigate = useNavigate();
  const { data: projects, isLoading, isError, refetch } = useProjects();
  const [search, setSearch] = React.useState("");

  // IMPORTANTE: memoizar el nodo. useTopbarActions lo mete en un
  // useEffect con `node` como dependencia — pasar JSX inline sin
  // useMemo crea una referencia nueva en cada render y provoca un bucle
  // de renders infinito (setActions -> re-render -> nuevo nodo -> efecto
  // -> setActions -> ...) que deja la app "congelada" hasta refrescar.
  const topbarActions = React.useMemo(
    () => (
      <div className="flex items-center gap-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.5}
          />
          <Input
            placeholder="Buscar proyectos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56 pl-8"
          />
        </div>
        <Button onClick={() => navigate("/projects/new")}>
          <Plus /> Nuevo proyecto
        </Button>
      </div>
    ),
    [search, navigate],
  );
  useTopbarActions(topbarActions);

  const filtered = (projects ?? []).filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Proyectos</h1>
        <p className="text-sm text-muted-foreground">
          Proyectos de validacion de datos y de pipelines.
        </p>
      </div>

      {isLoading ? (
        <CardGridSkeleton />
      ) : isError ? (
        <ErrorState
          message="No se pudieron cargar los proyectos."
          onRetry={() => refetch()}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="Aun no tienes proyectos en Quala"
          description="Crea tu primer proyecto de validacion de datos o de pipelines."
          action={
            <Button onClick={() => navigate("/projects/new")}>
              <Plus /> Crear el primero
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}

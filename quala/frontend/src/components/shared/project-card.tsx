import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  Clock,
  Database,
  PlugZap,
  ShieldCheck,
  Wand2,
  Waypoints,
  Workflow,
} from "lucide-react";
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getGraphSummarySync } from "@/lib/mock-api";
import type { Project, QualaNodeType } from "@/types";

function qualityColor(score: number) {
  if (score > 85) return "text-success";
  if (score >= 60) return "text-warning";
  return "text-destructive";
}

const NODE_TYPE_ICON: Record<QualaNodeType, typeof Database> = {
  data_source: Database,
  synthetic_generator: Wand2,
  pipeline: Workflow,
  validation: ShieldCheck,
};

export function ProjectCard({ project }: { project: Project }) {
  const navigate = useNavigate();
  // Lectura sincrona y ligera del grafo persistido, solo para mostrar un
  // resumen (numero de nodos + tipos presentes) en vez del antiguo badge
  // de "tipo de proyecto" fijo, que ya no existe como concepto.
  const graphSummary = React.useMemo(
    () => getGraphSummarySync(project.id),
    [project.id],
  );

  function handleClick() {
    navigate(`/projects/${project.id}`);
  }

  return (
    <Card
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") handleClick();
      }}
      className="cursor-pointer transition-colors hover:border-primary/40"
    >
      <CardHeader>
        <div className="flex items-center gap-2">
          <Waypoints className="size-5 text-brand" strokeWidth={1.5} />
          <span className="font-medium">{project.name}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {graphSummary ? (
            <>
              <Badge variant="secondary">
                {graphSummary.nodeCount}{" "}
                {graphSummary.nodeCount === 1 ? "nodo" : "nodos"}
              </Badge>
              <div className="flex items-center gap-1">
                {graphSummary.types.map((type) => {
                  const Icon = NODE_TYPE_ICON[type as QualaNodeType];
                  return Icon ? (
                    <Icon
                      key={type}
                      className="size-3.5 text-muted-foreground"
                      strokeWidth={1.5}
                    />
                  ) : null;
                })}
              </div>
            </>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Grafo vacio
            </Badge>
          )}
          {!project.connection_id ? (
            <Badge variant="warning">
              <PlugZap className="size-3" /> Sin conexion
            </Badge>
          ) : null}
        </div>

        <div className="flex items-center justify-between">
          {project.last_run_at ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3.5" strokeWidth={1.5} />
              hace{" "}
              {formatDistanceToNow(new Date(project.last_run_at), {
                locale: es,
              })}
            </span>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Sin ejecutar
            </Badge>
          )}

          {typeof project.last_quality_score === "number" ? (
            <span
              className={`text-sm font-semibold ${qualityColor(project.last_quality_score)}`}
            >
              {project.last_quality_score}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

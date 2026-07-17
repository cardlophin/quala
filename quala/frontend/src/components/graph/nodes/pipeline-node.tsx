import type { Node, NodeProps } from "@xyflow/react";
import { Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { describeAcceptedSources } from "@/lib/graph-rules";
import { useNodeActions } from "../node-actions-context";
import { NodeShell } from "../node-shell";
import type { PipelineConfig, PipelineRunResult, QualaNodeData } from "@/types";

export type PipelineNodeType = Node<QualaNodeData, "pipeline">;

const RESOURCE_KIND_LABEL: Record<PipelineConfig["kind"], string> = {
  job: "Job",
  pipeline: "Pipeline",
};

/**
 * Ejecuta un job/pipeline de Databricks. Su entrada es SIEMPRE un reflejo
 * de las aristas del canvas (ya no existe una entrada embebida
 * configurable a mano dentro del panel, ver rediseno del panel de
 * Pipeline) -- el aviso de handle de entrada se muestra en cuanto el nodo
 * no tiene ninguna arista entrante.
 */
export function PipelineNode({ id, data, selected }: NodeProps<PipelineNodeType>) {
  const { openPanel, hasIncomingEdge, getVerification } = useNodeActions();
  const config = data.config as unknown as PipelineConfig;
  const result = data.result as PipelineRunResult | undefined;
  const connected = hasIncomingEdge(id);
  const showInputWarning = !connected;

  const resourceLabel = config.resource_id ? RESOURCE_KIND_LABEL[config.kind] : null;

  return (
    <NodeShell
      icon={Workflow}
      title={data.label}
      status={data.status}
      nodeType="pipeline"
      hasInput
      hasOutput
      inputWarning={showInputWarning}
      inputWarningMessage={describeAcceptedSources("pipeline")}
      verification={getVerification(id)}
      selected={selected}
      onOpen={() => openPanel(id)}
      summary={
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            {resourceLabel ? (
              <Badge variant="secondary" className="text-[10px]">
                {resourceLabel}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">
                Sin recurso configurado
              </Badge>
            )}
          </div>
          {result ? (
            <span>
              Ultima ejecucion: {result.status === "success" ? "OK" : "fallo"}
            </span>
          ) : (
            "Sin ejecutar todavia"
          )}
        </div>
      }
    />
  );
}

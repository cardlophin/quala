import type { Node, NodeProps } from "@xyflow/react";
import { ShieldCheck } from "lucide-react";
import { describeAcceptedSources } from "@/lib/graph-rules";
import { useNodeActions } from "../node-actions-context";
import { NodeShell } from "../node-shell";
import type { QualaNodeData, ValidationConfig, ValidationFeedback } from "@/types";

export type ValidationNodeType = Node<QualaNodeData, "validation">;

/**
 * Valida los datos que le llegan del nodo conectado a su entrada (o de una
 * tabla elegida directamente si no hay nada conectado, el "caso simple")
 * contra reglas de negocio traducidas a SQL. Ya NO es estrictamente
 * terminal: su salida puede alimentar un nodo "Pipeline" (validacion de
 * entrada -> pipeline -> validacion de salida), ver graph-rules.ts.
 */
export function ValidationNode({ id, data, selected }: NodeProps<ValidationNodeType>) {
  const { openPanel, hasIncomingEdge } = useNodeActions();
  const config = data.config as unknown as ValidationConfig;
  const result = data.result as ValidationFeedback | undefined;
  const connected = hasIncomingEdge(id);

  return (
    <NodeShell
      icon={ShieldCheck}
      title={data.label}
      status={data.status}
      nodeType="validation"
      hasInput
      hasOutput
      inputWarning={!connected}
      inputWarningMessage={describeAcceptedSources("validation")}
      selected={selected}
      onOpen={() => openPanel(id)}
      summary={
        result ? (
          `${result.evaluated_rules} reglas, score ${result.data_quality_score}%`
        ) : config.business_rules.length > 0 ? (
          `${config.business_rules.length} regla(s) sin ejecutar`
        ) : (
          "Sin reglas anadidas"
        )
      }
    />
  );
}

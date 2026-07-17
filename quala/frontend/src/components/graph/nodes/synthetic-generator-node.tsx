import type { Node, NodeProps } from "@xyflow/react";
import { Wand2 } from "lucide-react";
import { useNodeActions } from "../node-actions-context";
import { NodeShell } from "../node-shell";
import type {
  GenerationRunResult,
  QualaNodeData,
  SyntheticGeneratorConfig,
} from "@/types";

export type SyntheticGeneratorNodeType = Node<QualaNodeData, "synthetic_generator">;

/**
 * Genera un dataset sintetico (planner + runner) que puede alimentar un
 * pipeline o una validacion. A diferencia de Pipeline/Validacion, su
 * entrada es OPCIONAL: puede tener un handle de entrada conectado a una
 * Fuente de datos (esquema de referencia, ver COMPATIBILITY en
 * graph-rules.ts) pero funciona exactamente igual sin nada conectado, asi
 * que nunca muestra un aviso de "falta conectar algo" en el handle.
 */
export function SyntheticGeneratorNode({
  id,
  data,
  selected,
}: NodeProps<SyntheticGeneratorNodeType>) {
  const { openPanel } = useNodeActions();
  const config = data.config as unknown as SyntheticGeneratorConfig;
  const result = data.result as GenerationRunResult | undefined;

  return (
    <NodeShell
      icon={Wand2}
      title={data.label}
      status={data.status}
      nodeType="synthetic_generator"
      hasInput
      hasOutput
      selected={selected}
      onOpen={() => openPanel(id)}
      summary={
        result ? (
          <span className="block truncate font-mono">{result.output_table}</span>
        ) : config.plan ? (
          `Plan listo: ${config.plan.tables.length} tabla(s)`
        ) : config.description ? (
          <span className="block truncate">{config.description}</span>
        ) : (
          "Sin describir aun"
        )
      }
    />
  );
}

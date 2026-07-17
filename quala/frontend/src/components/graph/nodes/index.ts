import type { NodeTypes } from "@xyflow/react";
import { DataSourceNode } from "./data-source-node";
import { PipelineNode } from "./pipeline-node";
import { SyntheticGeneratorNode } from "./synthetic-generator-node";
import { ValidationNode } from "./validation-node";

// Definido FUERA de cualquier componente de render (siguiendo el patron
// oficial de React Flow para "Custom Nodes"): un objeto nuevo en cada
// render de <ReactFlow> provoca warnings y recreaciones innecesarias.
export const nodeTypes: NodeTypes = {
  data_source: DataSourceNode,
  synthetic_generator: SyntheticGeneratorNode,
  pipeline: PipelineNode,
  validation: ValidationNode,
};

export * from "./data-source-node";
export * from "./pipeline-node";
export * from "./synthetic-generator-node";
export * from "./validation-node";

# Contexto: src/components/graph/nodes

## Última actualización
2026-07-06

## Qué vive aquí
Componentes de nodo tal como se ven colapsados en el canvas de React Flow: `data-source-node.tsx`, `pipeline-node.tsx`, `synthetic-generator-node.tsx`, `validation-node.tsx`, más el índice `index.ts` que los registra en `nodeTypes`. No incluye los paneles de configuración (esos viven en `../panels/`).

## Estado actual
- `pipeline-node.tsx`: ya no lee `input_mode`/`embedded_*` (eliminados de `PipelineConfig`). El aviso de "falta conectar entrada" (`inputWarning` en `NodeShell`) se basa únicamente en si hay una arista entrante (`hasIncomingEdge`).
- `synthetic-generator-node.tsx`: ganó la prop `hasInput` en `<NodeShell>` para reflejar si tiene una arista entrante desde una Fuente de datos, pero nunca activa `inputWarning` — la entrada es opcional, así que no hay estado de "falta algo" que mostrar.
- `validation-node.tsx`, `data-source-node.tsx`: sin cambios en esta sesión.
- `index.ts`: sin cambios (el registro de `nodeTypes` no varió).

## Decisiones de diseño tomadas
- Solo Pipeline y Validación muestran el aviso visual de handle vacío, porque su entrada es obligatoria para ejecutar. Sintético nunca lo muestra porque su entrada es opcional (mejora la calidad de generación pero no es requisito).

## Pendiente de implementar
Nada pendiente conocido en este directorio.

## Bugs conocidos / deuda técnica
Ninguno conocido en este directorio.

## Dependencias con otros directorios
Consumen `node-actions-context.tsx` (de `../`) para leer el estado de conexión/entrada, y `src/lib/graph-rules.ts` para saber qué conexiones son válidas. El contenido del panel de configuración de cada nodo vive en `../panels/`, no aquí.

## Para el siguiente agente
Si necesitas cambiar qué aviso muestra un nodo colapsado (no su panel), este es el directorio. Para cambiar la lógica de qué cuenta como "entrada conectada", revisa primero `node-actions-context.tsx` en el directorio padre.

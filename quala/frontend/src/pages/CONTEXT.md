# Contexto: src/pages

## Última actualización
2026-07-06

## Qué vive aquí
Páginas de nivel ruta de React Router. Esta nota documenta ÚNICAMENTE `project-canvas-page.tsx`, la única página tocada o discutida en esta sesión. El resto del directorio (`compare-page.tsx`, `connections-page.tsx`, `history-page.tsx`, `login-page.tsx`, `new-project-page.tsx`, `onboarding-page.tsx`, `pipeline-page.tsx`, `planner-page.tsx`, `project-summary-page.tsx`, `projects-index-page.tsx`, `results-page.tsx`, `settings-page.tsx`, `validation-page.tsx`, `index.ts`) no se tocó ni se discutió y no está documentado aquí.

## Estado actual
`project-canvas-page.tsx` es la página del canvas de grafo (`/projects/:id`). Cambios de esta sesión:
- `createNodeData`: el caso `pipeline` ahora inicializa `active_input_source_id: null` (además de `connected_sources`, ya existente); el caso `synthetic_generator` ahora inicializa `reference_sources: []`.
- `getIncomingSources` (expuesto vía `NodeActionsContext`) devuelve `status` y, cuando la fuente es un nodo `validation`, `validationSources` calculado con `resolveSourceAlias(s, all)` directamente aquí — ningún consumidor necesita recalcularlo.
- `onConnect` ya no fuerza ni resetea ningún campo de configuración de Pipeline al conectar/desconectar una arista; cada panel se sincroniza solo mediante su propio efecto interno (ver `../components/graph/panels/CONTEXT.md`).
- Renderizado de paneles: se eliminó el import y uso de `NodeConfigSheet`. Ahora hay 4 ramas ternarias, una por tipo de nodo, cada una invocando el panel correspondiente directamente con las props de cabecera (`open, onOpenChange, icon, nodeTypeLabel, label, onLabelChange, status`) más las props específicas de cada panel (`data`/`connectionId`/`onChange` para Fuente de datos; `nodeId` para los otros 3; `copySources` adicional para Validación).

## Decisiones de diseño tomadas
- Los paneles ya no se renderizan como `children` de un wrapper compartido; cada uno se monta directamente, porque `NodeConfigDialog` (el nuevo shell) no acepta `children` y cada panel ahora es autocontenido.

## Pendiente de implementar
Nada pendiente conocido en esta página.

## Bugs conocidos / deuda técnica
Ninguno propio de esta página.

## Dependencias con otros directorios
Consume los 4 paneles de `../components/graph/panels/`, `NodeActionsProvider`/`node-actions-context.tsx` de `../components/graph/`, y las formas de configuración de `../types/graph.ts`.

## Para el siguiente agente
Si necesitas añadir un nuevo tipo de nodo, aquí es donde se registra en `createNodeData` y aquí es donde se añade la rama ternaria para su panel. El resto de `src/pages/` es terreno inexplorado en esta sesión — no asumas nada sobre su estado sin leerlo primero.

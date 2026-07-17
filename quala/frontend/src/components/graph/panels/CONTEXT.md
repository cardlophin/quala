# Contexto: src/components/graph/panels

## Última actualización
2026-07-06

## Qué vive aquí
Los 4 paneles de configuración de nodo, uno por tipo: `data-source-panel.tsx`, `synthetic-generator-panel.tsx`, `pipeline-panel.tsx`, `validation-panel.tsx`. Cada uno es autocontenido: recibe props de cabecera (`open, onOpenChange, icon, nodeTypeLabel, label, onLabelChange, status`) desde `project-canvas-page.tsx` y monta internamente su propio `NodeConfigDialog` con sus pestañas y barra de acción.

## Estado actual
Migración Sheet → Dialog con pestañas completa en los 4 paneles. Detalle por panel:

- **`data-source-panel.tsx`**: 2 pestañas, "Tabla" (`TableExplorer`) y "Esquema y datos" (`SchemaPreview` o estado vacío). Sin barra de acción (no tiene una acción primaria propia).
- **`synthetic-generator-panel.tsx`**: 3 pestañas — "Configuración" (lista de esquema de referencia vía `PipelineInputSourcesList` si hay conexión + campo "Descripción del negocio", ahora controlado directamente contra `config.description` en vez de estado local, corrigiendo un bug donde el texto se perdía si se cerraba el panel sin pulsar "Generar plan" + botón "Generar plan"), "Esquema" (vista amigable/YAML del plan, o texto de aviso si no hay plan aún), "Datos generados" (deshabilitada si no hay `config.plan`; tabla de resultado o "Aún no se han generado datos."). Barra de acción: botón "Generar datos" si hay plan, si no un Alert explicando que hace falta generar el plan primero. La lógica de `synthetic-generator-fields.tsx` (ya eliminado) quedó incorporada aquí directamente, porque "Generar plan" y "Generar datos" ahora viven en pestañas/zonas distintas y no pueden compartir un único bloque JSX.
- **`pipeline-panel.tsx`**: 3 pestañas — "Configuración" (`PipelineResourcePicker section="config"` + verificación + `PipelineLogsStream` + resumen de resultado + botón para enviar la salida a un nodo de Validación), "Parámetros" (`PipelineResourcePicker section="parameters"`), "Entrada" (lista de fuentes conectadas con selección de fuente activa vía radio button cuando hay 2+, o Alert de "Sin entrada conectada"). Barra de acción: botón "Ejecutar pipeline" si `canRun`, si no un Alert con el motivo específico.
- **`validation-panel.tsx`**: 3 pestañas — "Origen de datos" (`ConnectedSourcesList`), "Reglas" (deshabilitada si no hay entrada; editor de reglas + sugerencias + "Generar reglas SQL" + `SqlRulesTable` — este bloque vive dentro de "Reglas" y no tiene pestaña propia porque la especificación solo listó 3 pestañas para Validación), "Resultados" (deshabilitada hasta ejecutar; skeleton/error/`ValidationFeedbackView`/estado vacío). Barra de acción: "Ejecutar validación" si hay `rule_set`, si no un Alert. `SourceMetadataSheet` se renderiza como hermano de `NodeConfigDialog` dentro de un Fragment (el shell no acepta `children`).

Patrón universal en los 4: cuando la acción primaria no puede ejecutarse, la barra de acción muestra un `Alert` con el motivo concreto en vez de un botón deshabilitado sin explicación.

## Decisiones de diseño tomadas
- Cada panel monta su propio `NodeConfigDialog` en vez de recibirlo como wrapper externo — permite que cada uno defina sus propias pestañas/barra de acción sin un componente intermedio genérico que tenga que soportar todos los casos.
- "Generar plan" (intermedio) y "Generar datos" (acción final) vistas y verbalmente distintas: la primera vive dentro de la pestaña "Configuración", la segunda es la única acción de la barra fija.
- El "Generar reglas SQL" de Validación no tiene pestaña propia porque la especificación de la migración solo definió 3 pestañas para este nodo.

## Pendiente de implementar
Nada pendiente conocido — la migración a Dialog/pestañas está completa en los 4 paneles y verificada con `tsc --noEmit` + `vite build`. Falta QA manual en navegador (ver `CONTEXT.md` raíz).

## Bugs conocidos / deuda técnica
Ninguno propio de este directorio (el bug de alias se resolvió en `../connected-sources-list.tsx` / `../pipeline-input-sources-list.tsx` / `src/lib/format.ts`, consumido aquí).

## Dependencias con otros directorios
Dependen de `../node-config-dialog.tsx` (shell), `../pipeline-input-sources-list.tsx` y `../connected-sources-list.tsx` (listas de fuentes), `../pipeline-resource-picker.tsx` (dividido por prop `section`), `src/lib/format.ts` (`resolveSourceAlias`), y `src/types/graph.ts` (formas de config). Son consumidos únicamente por `src/pages/project-canvas-page.tsx`.

## Para el siguiente agente
Si vas a cambiar el contenido de una pestaña concreta, entra directo al archivo del panel correspondiente — cada uno es independiente y no hay lógica compartida entre paneles salvo los helpers de `src/lib/` y las listas de `../`.

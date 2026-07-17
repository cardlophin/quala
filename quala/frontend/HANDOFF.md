# Handoff — Quala Frontend

## Última sesión
2026-07-06 (backend + puente front↔back)

## Resumen — sesión backend/puente (2026-07-06)
Se creó desde cero el backend HTTP (`quala/backend/api/`, FastAPI): primer
vertical slice **Validación sobre Databricks** (OAuth M2M real + Gemini para
traducir reglas a SQL), persistencia SQLite, y CRUD de conexiones/proyectos +
grafo. Se conectó el frontend con un cliente real `src/lib/api.ts` + selector
`src/lib/api-client.ts` (`VITE_USE_MOCK_API`); los hooks importan `{ api }`
desde `api-client`. Se corrigió el enum `GeneratorType` (faltaba
`parent_field_ref`). `tsc --noEmit` limpio en ambos pasos. Detalle en
`quala/backend/api/CONTEXT.md` y `src/lib/CONTEXT.md`. Pendiente: QA en
navegador contra el backend real (requiere Databricks vivo) y montar los
slices restantes (sintético, pipeline, historial).

## Resumen ejecutivo
Esta sesión completó tres iteraciones grandes sobre el panel de configuración de nodos del canvas: (1) rediseño del panel Pipeline para que su entrada dependa solo de las aristas del canvas, sin toggle ni entrada embebida; (2) selección de "entrada activa" cuando el Pipeline tiene varias fuentes conectadas, y apertura del nodo Generador sintético para aceptar una Fuente de datos como esquema de referencia opcional; (3) migración completa de los 4 paneles de nodo de un Sheet lateral a un Dialog modal con pestañas y barra de acción fija, junto con la corrección definitiva del bug de alias inventados ("datos"/"datos_2") en las tres listas de fuentes conectadas. Todo lo anterior está implementado, compila sin errores (`tsc --noEmit`) y en producción (`vite build`), sin diferencias entre el directorio de trabajo y el repositorio real.

## Mapa de directorios documentados
- [`CONTEXT.md`](./CONTEXT.md) — visión general de la app y estado global.
- [`src/types/CONTEXT.md`](./src/types/CONTEXT.md) — modelo de datos del grafo (`PipelineConfig`, `ConnectedSource`, `SyntheticGeneratorConfig`).
- [`src/lib/CONTEXT.md`](./src/lib/CONTEXT.md) — helper `resolveSourceAlias` y matriz de compatibilidad del grafo.
- [`src/components/graph/CONTEXT.md`](./src/components/graph/CONTEXT.md) — `NodeConfigDialog` (shell compartido de los paneles) y listas de fuentes conectadas.
- [`src/components/graph/nodes/CONTEXT.md`](./src/components/graph/nodes/CONTEXT.md) — componentes de nodo colapsados en el canvas.
- [`src/components/graph/panels/CONTEXT.md`](./src/components/graph/panels/CONTEXT.md) — los 4 paneles de configuración con pestañas.
- [`src/pages/CONTEXT.md`](./src/pages/CONTEXT.md) — wiring en `project-canvas-page.tsx`.

## Orden recomendado de lectura para retomar
1. `CONTEXT.md` (raíz) — panorama general y pendientes de mayor nivel.
2. `src/types/CONTEXT.md` — entender el modelo de datos antes que cualquier componente.
3. `src/lib/CONTEXT.md` — los dos helpers que todo lo demás consume.
4. `src/components/graph/CONTEXT.md` — el shell compartido y las listas reutilizadas.
5. `src/components/graph/nodes/CONTEXT.md` y `src/components/graph/panels/CONTEXT.md` — el detalle por tipo de nodo.
6. `src/pages/CONTEXT.md` — cómo se conecta todo en la página del canvas.

## Trabajo pendiente de mayor prioridad
1. Confirmar el contenido de "PROBLEMA 1" (mencionado por el usuario en el mensaje de corrección de bugs de nodos, nunca compartido completo en esta sesión) — ver `CONTEXT.md` raíz.
2. Decidir si el esquema de referencia del nodo Sintético debe aceptar también salidas de `pipeline`/`validation`, no solo `data_source` — ver `src/lib/CONTEXT.md`.
3. QA manual en navegador de la migración Dialog/pestañas y de la corrección de alias — solo se verificó compilación, no interacción real.
4. (Opcional, no bloqueante) Code-splitting del bundle principal (965kB) si se quiere optimizar la carga inicial.

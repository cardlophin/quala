import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useJobs, useLakeflowPipelines } from "@/hooks/use-databricks-resources";
import type { PipelineParameterMapping, PipelineResourceKind } from "@/types";

// Nombres de parámetro que suelen representar la tabla de SALIDA: se
// auto-mapean a "resolved_output" (tabla del nodo de datos conectado a la
// salida del pipeline) al seleccionar el recurso.
const OUTPUT_PARAM_RE = /out(put)?|target|salida|destino|sink|result|resultado/i;

// Nombres de parámetro que representan una tabla de ENTRADA: se auto-mapean a
// "resolved_input" (una de las fuentes conectadas al pipeline).
const INPUT_PARAM_RE = /(_table$)|table|tabla|input|source|origen|dataset/i;

/**
 * Selector "Job vs Pipeline (Lakeflow)" + seleccion del recurso concreto
 * (con busqueda, tarjeta resumen y enlace "Ver en Databricks") +
 * formulario de parametros dinamico (secciones 4.1.1, 4.1.2 y 4.1.4 del
 * refactor de paneles de nodo). Un Job declara parametros explicitos; un
 * Lakeflow Pipeline expone un diccionario `configuration` libre donde una
 * clave (heuristica del mock) representa la tabla de entrada. En ambos
 * casos, cada campo se mapea a un valor fijo o a la tabla de entrada ya
 * resuelta a partir de las fuentes conectadas en el canvas (ver
 * PipelinePanel).
 *
 * `section` decide que mitad del formulario se renderiza (migracion
 * "Sheet -> Dialog con pestanas": la pestana "Configuracion" del Pipeline
 * muestra "config" -- tipo de recurso + selector + tarjeta resumen -- y la
 * pestana "Parametros" muestra "parameters" -- la tabla de parametros).
 * Es el MISMO componente, con los mismos hooks/estado derivado, montado
 * dos veces (una por pestana) en vez de duplicar la logica.
 */
export function PipelineResourcePicker({
  connectionId,
  kind,
  resourceId,
  parameterMappings,
  inputTable,
  inputSources,
  activeInputSourceId,
  outputTable,
  onChange,
  section,
}: {
  connectionId: string | null | undefined;
  kind: PipelineResourceKind;
  resourceId: string;
  parameterMappings: PipelineParameterMapping[];
  inputTable: string | null;
  // Todas las fuentes conectadas a la entrada del pipeline (multi-entrada):
  // cada parámetro "resolved_input" puede apuntar a una distinta.
  inputSources: { node_id: string; alias: string; resolved_table: string | null }[];
  activeInputSourceId: string | null;
  outputTable: string | null;
  onChange: (patch: {
    kind?: PipelineResourceKind;
    resource_id?: string;
    resource_name?: string;
    parameter_mappings?: PipelineParameterMapping[];
  }) => void;
  section: "config" | "parameters";
}) {
  const { data: jobs, isLoading: loadingJobs } = useJobs(connectionId ?? undefined);
  const { data: pipelines, isLoading: loadingPipelines } = useLakeflowPipelines(
    connectionId ?? undefined,
  );

  const selectedJob = jobs?.find((j) => j.job_id === resourceId);
  const selectedPipeline = pipelines?.find((p) => p.pipeline_id === resourceId);
  const selectedResource = kind === "job" ? selectedJob : selectedPipeline;

  function selectKind(newKind: PipelineResourceKind) {
    onChange({ kind: newKind, resource_id: "", resource_name: undefined, parameter_mappings: [] });
  }

  // Empareja un parámetro de tabla con la fuente conectada más parecida por
  // nombre (ej. "pedidos_table" -> fuente cuyo alias/tabla contiene "pedidos";
  // "scoring_table" -> ...clientes_scoring). Si no hay match, usa la activa.
  function bestSourceForParam(paramName: string): string | undefined {
    if (inputSources.length === 0) return undefined;
    const token = paramName
      .toLowerCase()
      .replace(/(_?(table|tabla|input|source|origen|dataset)_?)/g, " ")
      .trim();
    if (token) {
      const match = inputSources.find(
        (s) =>
          s.alias.toLowerCase().includes(token) ||
          (s.resolved_table ?? "").toLowerCase().includes(token),
      );
      if (match) return match.node_id;
    }
    return activeInputSourceId ?? inputSources[0]?.node_id;
  }

  // Auto-mapeo de un parámetro al seleccionar el recurso: SALIDA -> nodo de
  // salida; parámetro de tabla de ENTRADA -> fuente conectada emparejada;
  // resto -> valor fijo con su default.
  function autoMapping(name: string, def?: string): PipelineParameterMapping {
    if (OUTPUT_PARAM_RE.test(name)) {
      return { param_name: name, default_value: def, source: "resolved_output" };
    }
    if (inputSources.length > 0 && INPUT_PARAM_RE.test(name)) {
      return {
        param_name: name,
        default_value: def,
        source: "resolved_input",
        input_source_id: bestSourceForParam(name),
      };
    }
    return {
      param_name: name,
      default_value: def,
      source: "fixed_value",
      fixed_value: def ?? "",
    };
  }

  function selectResource(newResourceId: string) {
    let mappings: PipelineParameterMapping[] = [];
    let resourceName: string | undefined;
    if (kind === "job") {
      const job = jobs?.find((j) => j.job_id === newResourceId);
      resourceName = job?.name;
      mappings = (job?.parameters ?? []).map((p) => autoMapping(p.name, p.default));
    } else {
      const pipeline = pipelines?.find((p) => p.pipeline_id === newResourceId);
      resourceName = pipeline?.name;
      mappings = Object.entries(pipeline?.configuration ?? {}).map(([key, value]) => {
        if (key === pipeline?.input_config_key) {
          return {
            param_name: key,
            default_value: value,
            source: "resolved_input",
            input_source_id: bestSourceForParam(key),
          };
        }
        return autoMapping(key, value);
      });
    }
    onChange({
      resource_id: newResourceId,
      resource_name: resourceName,
      parameter_mappings: mappings,
    });
  }

  function updateMapping(paramName: string, patch: Partial<PipelineParameterMapping>) {
    onChange({
      parameter_mappings: parameterMappings.map((m) =>
        m.param_name === paramName ? { ...m, ...patch } : m,
      ),
    });
  }

  if (section === "parameters") {
    return (
      <div className="space-y-4">
        {parameterMappings.length > 0 ? (
          <div className="space-y-3">
            <Label>{kind === "job" ? "Parametros del job" : "Configuration del pipeline"}</Label>
            {parameterMappings.map((mapping) => {
              const isInputKey =
                kind === "pipeline" && mapping.param_name === selectedPipeline?.input_config_key;
              return (
                <div key={mapping.param_name} className="space-y-1.5 rounded-md border p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-medium">{mapping.param_name}</span>
                    {isInputKey ? (
                      <Badge variant="secondary" className="text-[10px]">
                        entrada principal
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Select
                      value={mapping.source}
                      onValueChange={(v) =>
                        updateMapping(mapping.param_name, {
                          source: v as PipelineParameterMapping["source"],
                          fixed_value:
                            v === "fixed_value" ? (mapping.default_value ?? "") : undefined,
                        })
                      }
                    >
                      <SelectTrigger className="w-44 shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="resolved_input">Desde entrada (nodo)</SelectItem>
                        <SelectItem value="resolved_output">Desde salida (nodo)</SelectItem>
                        <SelectItem value="fixed_value">Valor fijo</SelectItem>
                      </SelectContent>
                    </Select>
                    {mapping.source === "resolved_input" ? (
                      inputSources.length > 1 ? (
                        // Varias entradas: elige a cuál apunta ESTE parámetro.
                        <Select
                          value={
                            mapping.input_source_id ??
                            activeInputSourceId ??
                            inputSources[0]?.node_id ??
                            ""
                          }
                          onValueChange={(v) =>
                            updateMapping(mapping.param_name, { input_source_id: v })
                          }
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Elige la entrada..." />
                          </SelectTrigger>
                          <SelectContent>
                            {inputSources.map((s) => (
                              <SelectItem key={s.node_id} value={s.node_id}>
                                {s.alias}
                                {s.resolved_table ? ` — ${s.resolved_table}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="flex flex-1 items-center truncate rounded-md border bg-muted/40 px-2 font-mono text-xs text-muted-foreground">
                          {inputTable ?? "(entrada aun sin resolver)"}
                        </p>
                      )
                    ) : mapping.source === "resolved_output" ? (
                      <p className="flex flex-1 items-center truncate rounded-md border bg-muted/40 px-2 font-mono text-xs text-muted-foreground">
                        {outputTable ??
                          "(conecta un nodo de datos a la salida del pipeline)"}
                      </p>
                    ) : (
                      <Input
                        value={mapping.fixed_value ?? ""}
                        onChange={(e) =>
                          updateMapping(mapping.param_name, { fixed_value: e.target.value })
                        }
                        placeholder="Valor fijo..."
                        className="flex-1"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {resourceId
              ? "Este recurso no declara parametros configurables."
              : "Selecciona un Job o Pipeline en la pestana Configuracion para ver sus parametros."}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Ejecutar como</Label>
        <Select value={kind} onValueChange={(v) => selectKind(v as PipelineResourceKind)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="job">Job</SelectItem>
            <SelectItem value="pipeline">Pipeline (Lakeflow)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {kind === "job"
            ? "Un Job de Databricks se ejecuta de forma aislada con los datos de entrada."
            : "Un Pipeline de Databricks encadena múltiples tareas sobre los datos de entrada."}
        </p>
      </div>

      <div className="space-y-2">
        <Label>{kind === "job" ? "Job" : "Pipeline"}</Label>
        {kind === "job" ? (
          loadingJobs ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <Select value={resourceId} onValueChange={selectResource}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecciona un job..." />
              </SelectTrigger>
              <SelectContent>
                {jobs?.map((job) => (
                  <SelectItem key={job.job_id} value={job.job_id}>
                    {job.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        ) : loadingPipelines ? (
          <Skeleton className="h-9 w-full" />
        ) : (
          <Select value={resourceId} onValueChange={selectResource}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecciona un pipeline..." />
            </SelectTrigger>
            <SelectContent>
              {pipelines?.map((pipeline) => (
                <SelectItem key={pipeline.pipeline_id} value={pipeline.pipeline_id}>
                  {pipeline.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {selectedResource ? (
        <div className="space-y-1.5 rounded-md border p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{selectedResource.name}</span>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" asChild>
              <a href={selectedResource.workspace_url} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" strokeWidth={1.5} />
                Ver en Databricks
              </a>
            </Button>
          </div>
          <p className="font-mono text-xs text-muted-foreground">{resourceId}</p>
          {selectedResource.last_run_summary ? (
            <p className="text-xs text-muted-foreground">{selectedResource.last_run_summary}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

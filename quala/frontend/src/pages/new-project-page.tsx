import { Loader2 } from "lucide-react";
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateProject } from "@/hooks/use-projects";

/**
 * Ya no existe un selector de "tipo de proyecto": un proyecto es un grafo
 * vacio (con un nodo "Validacion" ya sugerido, ver defaultGraph en
 * mock-api.ts) al que se le van anadiendo nodos libremente en el canvas.
 * Crear un proyecto solo pide nombre; la conexion Databricks se sigue
 * pidiendo mas adelante, cuando el grafo la necesite de verdad.
 */
export function NewProjectPage() {
  const navigate = useNavigate();
  const createProject = useCreateProject();
  const [name, setName] = React.useState("");

  const canSubmit = Boolean(name.trim());

  async function handleCreate() {
    if (!canSubmit) return;
    const project = await createProject.mutateAsync({
      name: name.trim(),
      connection_id: null,
    });
    navigate(`/projects/${project.id}`);
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Nuevo proyecto</h1>
        <p className="text-sm text-muted-foreground">
          Dale un nombre. Construyes el flujo despues, en el canvas. La
          conexion Databricks se asigna mas adelante, cuando haga falta.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="project-name">Nombre del proyecto</Label>
        <Input
          id="project-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Validacion de pedidos EU"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
        />
      </div>

      <Button
        className="w-full sm:w-auto"
        disabled={!canSubmit || createProject.isPending}
        onClick={handleCreate}
      >
        {createProject.isPending ? <Loader2 className="animate-spin" /> : null}
        Crear proyecto
      </Button>
    </div>
  );
}

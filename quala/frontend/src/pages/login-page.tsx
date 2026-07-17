import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSessionStore } from "@/store";

const loginSchema = z.object({
  email: z.string().email("Introduce un email valido"),
  password: z.string().min(1, "Introduce tu contrasena"),
});

type LoginValues = z.infer<typeof loginSchema>;

/**
 * Login de identidad de usuario. Deliberadamente NO menciona Databricks
 * ni conexiones: eso es infraestructura, esto es autenticacion. Un
 * usuario puede tener sesion abierta sin ninguna conexion configurada.
 *
 * Mock por ahora: acepta cualquier email/contrasena validos. Sustituir
 * por la llamada real al backend de auth cuando exista.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const login = useSessionStore((s) => s.login);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  function onSubmit(values: LoginValues) {
    setIsSubmitting(true);
    setTimeout(() => {
      login({ name: values.email.split("@")[0] ?? values.email, email: values.email });
      const redirectTo = searchParams.get("from") ?? "/projects";
      navigate(redirectTo, { replace: true });
    }, 400);
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <img src="/logo-quala.png" alt="Quala" className="size-10 object-contain" />
          <CardTitle className="text-xl">Inicia sesion en Quala</CardTitle>
          <CardDescription>
            Accede a tus proyectos de generacion sintetica y validacion de
            datos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@empresa.com"
                {...register("email")}
              />
              {errors.email ? (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Contrasena</Label>
              <Input id="password" type="password" {...register("password")} />
              {errors.password ? (
                <p className="text-xs text-destructive">
                  {errors.password.message}
                </p>
              ) : null}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              Iniciar sesion
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

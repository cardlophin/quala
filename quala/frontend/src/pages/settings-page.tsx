import { Eye, EyeOff, Monitor, Moon, Sun } from "lucide-react";
import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useSessionStore, useThemeStore } from "@/store";

export function SettingsPage() {
  const navigate = useNavigate();
  const { theme, setTheme } = useThemeStore();
  const user = useSessionStore((s) => s.user) ?? { name: "", email: "" };
  const logout = useSessionStore((s) => s.logout);
  const [showKey, setShowKey] = React.useState(false);
  const [apiKey, setApiKey] = React.useState("");
  const [model, setModel] = React.useState("gemini-3-pro-preview");

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Ajustes</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Apariencia</CardTitle>
          <CardDescription>Elige como se ve Quala.</CardDescription>
        </CardHeader>
        <CardContent>
          <ToggleGroup
            type="single"
            value={theme}
            onValueChange={(v) => v && setTheme(v as typeof theme)}
          >
            <ToggleGroupItem value="light" aria-label="Claro">
              <Sun strokeWidth={1.5} /> Claro
            </ToggleGroupItem>
            <ToggleGroupItem value="dark" aria-label="Oscuro">
              <Moon strokeWidth={1.5} /> Oscuro
            </ToggleGroupItem>
            <ToggleGroupItem value="system" aria-label="Sistema">
              <Monitor strokeWidth={1.5} /> Sistema
            </ToggleGroupItem>
          </ToggleGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Modelo de lenguaje</CardTitle>
          <CardDescription>
            API key de Gemini usada para traducir reglas de negocio.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="gemini-key">API key</Label>
            <div className="relative">
              <Input
                id="gemini-key"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? (
                  <EyeOff className="size-4" strokeWidth={1.5} />
                ) : (
                  <Eye className="size-4" strokeWidth={1.5} />
                )}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Modelo</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gemini-3-pro-preview">
                  gemini-3-pro-preview
                </SelectItem>
                <SelectItem value="gemini-2.5-pro">gemini-2.5-pro</SelectItem>
                <SelectItem value="gemini-2.5-flash">
                  gemini-2.5-flash
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cuenta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">{user.name}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <Separator />
          <Button
            variant="outline"
            onClick={() => {
              logout();
              navigate("/login", { replace: true });
            }}
          >
            Cerrar sesion
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

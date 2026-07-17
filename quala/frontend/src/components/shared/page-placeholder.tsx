import type { LucideIcon } from "lucide-react";

interface PagePlaceholderProps {
  icon: LucideIcon;
  title: string;
  description: string;
  note?: string;
}

/**
 * Shell minimo para pantallas cuya implementacion completa (wizards,
 * tablas, graficos) se construira en una siguiente iteracion. Mantiene
 * el layout/routing/guardas verificables de punta a punta desde ya.
 */
export function PagePlaceholder({
  icon: Icon,
  title,
  description,
  note,
}: PagePlaceholderProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-20 text-center">
        <Icon className="size-8 text-muted-foreground" strokeWidth={1.5} />
        <p className="text-sm text-muted-foreground">
          {note ?? "Esta pantalla se implementara en una proxima iteracion."}
        </p>
      </div>
    </div>
  );
}

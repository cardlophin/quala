import {
  History,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Settings,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useSidebar } from "./sidebar-context";

const NAV_ITEMS = [
  { to: "/projects", label: "Proyectos", icon: LayoutGrid },
  { to: "/connections", label: "Conexiones", icon: Plug },
  { to: "/history", label: "Historial", icon: History },
  { to: "/settings", label: "Ajustes", icon: Settings },
];

export function AppSidebar() {
  const { collapsed, toggle } = useSidebar();

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-svh shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200",
        collapsed ? "w-16" : "w-64",
        // Por debajo de lg, la sidebar siempre colapsa a solo iconos.
        "max-lg:w-16",
      )}
    >
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-3">
        <img
          src="/logo-quala.png"
          alt="Quala"
          className="size-7 shrink-0 object-contain"
        />
        <span
          className={cn(
            "truncate text-base font-semibold",
            collapsed && "hidden",
            "max-lg:hidden",
          )}
        >
          Quala
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-2">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-brand/15 text-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )
            }
          >
            <item.icon className="size-[18px] shrink-0" strokeWidth={1.5} />
            <span className={cn(collapsed && "hidden", "max-lg:hidden")}>
              {item.label}
            </span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-2">
        <button
          type="button"
          onClick={toggle}
          className="hidden w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:flex"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-[18px]" strokeWidth={1.5} />
          ) : (
            <PanelLeftClose className="size-[18px]" strokeWidth={1.5} />
          )}
          <span className={cn(collapsed && "hidden")}>Colapsar</span>
        </button>
      </div>
    </aside>
  );
}

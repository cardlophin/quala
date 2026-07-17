import { Outlet } from "react-router-dom";
import { AppSidebar } from "./app-sidebar";
import { AppTopbar } from "./app-topbar";
import { SidebarProvider } from "./sidebar-context";
import { TopbarSlotProvider } from "./topbar-slot";

/** Layout global: sidebar + topbar, todas las paginas dentro de <main>. */
export function AppLayout() {
  return (
    <TopbarSlotProvider>
      <SidebarProvider>
        <div className="flex min-h-svh w-full">
          <AppSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <AppTopbar />
            <main className="mx-auto w-full max-w-7xl flex-1 p-6">
              <Outlet />
            </main>
          </div>
        </div>
      </SidebarProvider>
    </TopbarSlotProvider>
  );
}

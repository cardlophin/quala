import { Check, ChevronsUpDown, Table2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Selector genérico de UN valor (string) entre una lista, con búsqueda.
 * Reutilizado para elegir catálogo, esquema y tabla en cascada (ver
 * TableExplorer) además del nodo "Fuente de datos".
 */
export function TablePicker({
  available,
  selected,
  onSelect,
  placeholder = "Selecciona una tabla...",
  searchPlaceholder = "Buscar catalogo.esquema.tabla...",
  emptyLabel = "No se encontraron tablas.",
  disabled = false,
  icon: Icon = Table2,
}: {
  available: string[];
  selected: string | null;
  onSelect: (table: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-10 w-full justify-between rounded-xl"
          disabled={disabled}
        >
          <span className="flex items-center gap-2 truncate text-muted-foreground">
            <Icon className="size-4 shrink-0" strokeWidth={1.5} />
            <span className={cn("truncate", selected && "text-foreground")}>
              {selected ?? placeholder}
            </span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 rounded-xl p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              {available.map((table) => (
                <CommandItem
                  key={table}
                  value={table}
                  onSelect={() => {
                    onSelect(table);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "size-4",
                      selected === table ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {table}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

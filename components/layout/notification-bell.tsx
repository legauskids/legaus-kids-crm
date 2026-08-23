"use client";

import { useState, useTransition } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { marcarLembreteComoLido } from "@/components/layout/actions";

type Lembrete = {
  id: string;
  nome: string;
  criadoEm: Date;
};

export function NotificationBell({ lembretes }: { lembretes: Lembrete[] }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="size-5" />
          {lembretes.length > 0 && (
            <Badge className="absolute -right-1 -top-1 h-5 min-w-5 justify-center rounded-full px-1 text-[10px]">
              {lembretes.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-2 text-sm font-medium">Notificações</div>
        {lembretes.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Nenhuma notificação pendente.
          </p>
        ) : (
          <ul className="max-h-80 divide-y overflow-auto">
            {lembretes.map((lembrete) => (
              <li key={lembrete.id} className="flex items-start justify-between gap-2 px-4 py-3 text-sm">
                <div>
                  <p>{lembrete.nome}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDistanceToNow(lembrete.criadoEm, { addSuffix: true, locale: ptBR })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      await marcarLembreteComoLido(lembrete.id);
                    })
                  }
                >
                  Ok
                </Button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

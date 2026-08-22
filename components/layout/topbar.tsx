import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { NotificationBell } from "@/components/layout/notification-bell";
import { getLembretesNaoLidos } from "@/lib/server/lembretes";
import type { SessionUser } from "@/lib/auth/session";
import { initials } from "@/lib/utils";

export async function Topbar({ user }: { user: SessionUser }) {
  const lembretes = await getLembretesNaoLidos(user.id);

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4">
      <div />
      <div className="flex items-center gap-3">
        <NotificationBell lembretes={lembretes} />
        <div className="flex items-center gap-2">
          <Avatar className="size-8">
            <AvatarFallback>{initials(user.nome)}</AvatarFallback>
          </Avatar>
          <div className="hidden text-sm leading-tight sm:block">
            <p className="font-medium">{user.nome}</p>
            <p className="text-xs text-muted-foreground">{user.papel}</p>
          </div>
        </div>
        <form action="/api/auth/logout" method="POST">
          <Button variant="ghost" size="icon" type="submit" title="Sair">
            <LogOut className="size-4" />
          </Button>
        </form>
      </div>
    </header>
  );
}

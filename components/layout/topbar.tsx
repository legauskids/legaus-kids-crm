import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { LogOut } from "lucide-react";
import { NotificationBell } from "@/components/layout/notification-bell";
import { getLembretesNaoLidos } from "@/lib/server/lembretes";
import type { SessionUser } from "@/lib/auth/session";
import { initials } from "@/lib/utils";

export async function Topbar({ user }: { user: SessionUser }) {
  const lembretes = await getLembretesNaoLidos(user.id);

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6 shadow-xs">
      <div>
        <p className="text-sm text-muted-foreground">
          Bem-vindo de volta, <span className="font-medium text-foreground">{user.nome.split(" ")[0]}</span>
        </p>
      </div>
      <div className="flex items-center gap-4">
        <NotificationBell lembretes={lembretes} />
        <Separator orientation="vertical" className="h-8" />
        <div className="flex items-center gap-2.5">
          <Avatar className="size-9 ring-2 ring-primary/10">
            <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">
              {initials(user.nome)}
            </AvatarFallback>
          </Avatar>
          <div className="hidden text-sm leading-tight sm:block">
            <p className="font-semibold text-foreground">{user.nome}</p>
            <p className="text-xs text-muted-foreground">{user.papel}</p>
          </div>
        </div>
        <form action="/api/auth/logout" method="POST">
          <Button variant="ghost" size="icon" type="submit" title="Sair" className="text-muted-foreground hover:text-destructive">
            <LogOut className="size-4" />
          </Button>
        </form>
      </div>
    </header>
  );
}

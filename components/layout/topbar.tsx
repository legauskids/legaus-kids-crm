import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { LogOut } from "lucide-react";
import { NotificationBell } from "@/components/layout/notification-bell";
import { UserPanel } from "@/components/layout/user-panel";
import { getLembretesNaoLidos } from "@/lib/server/lembretes";
import { listarUsuariosParaPainel } from "@/lib/server/usuarios";
import type { SessionUser } from "@/lib/auth/session";

export async function Topbar({ user }: { user: SessionUser }) {
  const [lembretes, { eu, outros }] = await Promise.all([
    getLembretesNaoLidos(user.id),
    listarUsuariosParaPainel(user),
  ]);

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
        <UserPanel currentUser={eu} outros={outros} />
        <form action="/api/auth/logout" method="POST">
          <Button variant="ghost" size="icon" type="submit" title="Sair" className="text-muted-foreground hover:text-destructive">
            <LogOut className="size-4" />
          </Button>
        </form>
      </div>
    </header>
  );
}

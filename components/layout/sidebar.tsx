"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  MessageCircle,
  Handshake,
  ListChecks,
  Factory,
  Puzzle,
  Sparkles,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/atendimento", label: "Atendimento", icon: MessageCircle },
  { href: "/negocios", label: "Negócios", icon: Handshake },
  { href: "/tarefas", label: "Tarefas", icon: ListChecks },
  { href: "/producao", label: "Produção", icon: Factory },
];

const NAV_ITEMS_SECUNDARIOS = [
  { href: "/extensao", label: "Extensão", icon: Puzzle },
];

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof LayoutDashboard; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
        active
          ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-sm",
      )}
    >
      <Icon
        className={cn(
          "size-4.5 shrink-0 transition-colors",
          active ? "text-primary-foreground" : "text-muted-foreground group-hover:text-sidebar-accent-foreground",
        )}
      />
      {label}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar sm:flex">
      <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Sparkles className="size-4" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-bold tracking-tight text-sidebar-foreground">Legaus Kids</p>
          <p className="text-[11px] font-medium text-muted-foreground">CRM</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        <p className="px-3 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Principal
        </p>
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return <NavLink key={item.href} {...item} active={active} />;
        })}
      </nav>

      <nav className="space-y-1 border-t border-sidebar-border p-3">
        {NAV_ITEMS_SECUNDARIOS.map((item) => {
          const active = pathname.startsWith(item.href);
          return <NavLink key={item.href} {...item} active={active} />;
        })}
      </nav>
    </aside>
  );
}

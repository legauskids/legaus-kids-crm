"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/components/layout/sidebar";

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="flex shrink-0 items-stretch border-t border-sidebar-border bg-sidebar sm:hidden">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
              active ? "text-primary" : "text-sidebar-foreground/70",
            )}
          >
            <Icon className={cn("size-5", active && "text-primary")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

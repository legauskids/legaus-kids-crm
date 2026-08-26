"use client";

import { useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CorPaleta } from "@/lib/utils/colors";

export function ExpandablePanel({
  title,
  children,
  expandedChildren,
  cor,
}: {
  title: string;
  children: ReactNode;
  expandedChildren?: ReactNode;
  /** Cor da paleta lúdica (lib/utils/colors.ts) — pinta uma faixa no topo do painel pra diferenciar cada um visualmente. Opcional. */
  cor?: CorPaleta;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Card className={cn("h-full gap-0 overflow-hidden border-t-4 py-0 transition-shadow hover:shadow-md", cor?.borderTop ?? "border-t-transparent")}>
      <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-border/60 py-4">
        <CardTitle className="flex items-center gap-2 text-sm font-bold text-foreground">
          {cor && <span className={cn("size-2 rounded-full", cor.dot)} />}
          {title}
        </CardTitle>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setOpen(true)}
          title="Expandir"
          className="text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <Maximize2 className="size-3.5" />
        </Button>
      </CardHeader>
      <CardContent className="py-4">{children}</CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {expandedChildren ?? children}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

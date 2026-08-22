"use client";

import { useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Maximize2 } from "lucide-react";

export function ExpandablePanel({
  title,
  children,
  expandedChildren,
}: {
  title: string;
  children: ReactNode;
  expandedChildren?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-semibold text-muted-foreground">{title}</CardTitle>
        <Button variant="ghost" size="icon-sm" onClick={() => setOpen(true)} title="Expandir">
          <Maximize2 className="size-3.5" />
        </Button>
      </CardHeader>
      <CardContent>{children}</CardContent>

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

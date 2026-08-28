"use client";

import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export function BotaoImprimir() {
  return (
    <Button onClick={() => window.print()}>
      <Printer className="size-4" />
      Imprimir / Salvar como PDF
    </Button>
  );
}

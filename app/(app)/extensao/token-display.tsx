"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Copy, Check, RefreshCw } from "lucide-react";
import { gerarApiTokenAction } from "@/app/(app)/extensao/actions";

export function TokenDisplay({ token }: { token: string }) {
  const [copiado, setCopiado] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input readOnly value={token} className="font-mono text-xs" />
        <Button
          variant="outline"
          size="icon"
          onClick={async () => {
            await navigator.clipboard.writeText(token);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1500);
          }}
          title="Copiar"
        >
          {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
      </div>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (!confirm("Gerar um novo token invalida o atual — a extensão vai parar de funcionar até você colar o novo. Continuar?")) return;
          startTransition(() => gerarApiTokenAction());
        }}
      >
        <RefreshCw className="size-3.5" />
        Gerar novo token
      </Button>
    </div>
  );
}

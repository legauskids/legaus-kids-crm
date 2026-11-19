"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { buscarDestinatariosAction } from "@/app/(app)/actions";
import { tipoBuscaDestinatario, type DestinatarioEnvio } from "@/lib/utils/destinatario";
import { telefoneLegivel, telefonePadraoBR } from "@/lib/utils/telefone";

// Campo "Para" dos envios pelo WhatsApp — orçamento, apresentação e produtos
// (pedido de 2026-11-17): acha o contato pelo nome ou pelo final do telefone
// ("6980") ou aceita o número inteiro com DDD.

export type EscolhaDestinatario = { telefone: string; nome?: string };

/** Estado do campo; `escolha` é null enquanto não tem pra quem mandar. */
export function useDestinatario(inicial: DestinatarioEnvio | null = null) {
  const [busca, setBusca] = useState("");
  const [destino, setDestino] = useState<DestinatarioEnvio | null>(inicial);
  const telefoneDigitado = telefonePadraoBR(busca);
  const numeroInteiro = !destino && tipoBuscaDestinatario(busca)?.tipo === "telefone" && telefoneDigitado.length >= 12;
  const escolha: EscolhaDestinatario | null = destino
    ? { telefone: destino.telefone, nome: destino.nome }
    : numeroInteiro
      ? { telefone: telefoneDigitado }
      : null;
  return { busca, setBusca, destino, setDestino, telefoneDigitado, numeroInteiro, escolha };
}

export function CampoDestinatario({
  id,
  estado,
  disabled,
}: {
  id: string;
  estado: ReturnType<typeof useDestinatario>;
  disabled?: boolean;
}) {
  const { busca, setBusca, destino, setDestino, telefoneDigitado, numeroInteiro } = estado;
  const [resultado, setResultado] = useState<{ termo: string; lista: DestinatarioEnvio[] } | null>(null);
  const [ativo, setAtivo] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const buscavel = !destino && tipoBuscaDestinatario(busca) !== null;

  useEffect(() => {
    if (!buscavel) return;
    let cancelado = false;
    const espera = setTimeout(() => {
      buscarDestinatariosAction(busca)
        .then((lista) => !cancelado && setResultado({ termo: busca, lista }))
        .catch(() => !cancelado && setResultado({ termo: busca, lista: [] }));
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(espera);
    };
  }, [busca, buscavel]);

  const sugestoes = buscavel && resultado ? resultado.lista : [];
  const nadaAchado = buscavel && resultado?.termo === busca && resultado.lista.length === 0 && !numeroInteiro;

  function escolher(s: DestinatarioEnvio) {
    setDestino(s);
    setBusca("");
    setResultado(null);
    setAtivo(0);
  }

  function trocar() {
    setDestino(null);
    setTimeout(() => inputRef.current?.focus());
  }

  function teclas(e: React.KeyboardEvent<HTMLInputElement>) {
    if (sugestoes.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAtivo((i) => Math.min(i + 1, sugestoes.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtivo((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      escolher(sugestoes[Math.min(ativo, sugestoes.length - 1)]);
    }
  }

  if (destino) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm">
        <span className="min-w-0 break-words">
          <span className="font-medium">{destino.nome || "Sem nome"}</span>{" "}
          <span className="whitespace-nowrap text-muted-foreground">— {destino.telefoneFormatado}</span>
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={trocar} disabled={disabled} aria-label="Trocar destinatário">
          <X className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        id={id}
        ref={inputRef}
        value={busca}
        onChange={(e) => {
          setBusca(e.target.value);
          setAtivo(0);
        }}
        onKeyDown={teclas}
        placeholder="Nome, final do telefone ou número com DDD"
        autoComplete="off"
        disabled={disabled}
        role="combobox"
        aria-expanded={sugestoes.length > 0}
        aria-controls={`${id}-sugestoes`}
        aria-autocomplete="list"
      />
      {sugestoes.length > 0 && (
        <ul id={`${id}-sugestoes`} role="listbox" className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
          {sugestoes.map((s, i) => (
            <li key={s.contatoId} role="option" aria-selected={i === ativo}>
              <button
                type="button"
                className={cn("flex w-full justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent", i === ativo && "bg-accent")}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => escolher(s)}
              >
                <span className="truncate">{s.nome || "Sem nome"}</span>
                <span className="shrink-0 text-muted-foreground">{s.telefoneFormatado}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {numeroInteiro ? (
        <p className="mt-1 text-xs text-muted-foreground">Vai para {telefoneLegivel(telefoneDigitado)}.</p>
      ) : nadaAchado ? (
        <p className="mt-1 text-xs text-muted-foreground">Nenhum contato com esse nome ou final de telefone.</p>
      ) : (
        !busca.trim() && (
          <p className="mt-1 text-xs text-muted-foreground">Busque pelo nome ou pelo final do telefone (ex.: 6980), ou digite o número inteiro com DDD.</p>
        )
      )}
    </div>
  );
}

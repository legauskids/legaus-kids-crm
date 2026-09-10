"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { initials } from "@/lib/utils";
import { buscarConversasAction, type BuscaConversaVM } from "@/app/(app)/atendimento/actions";
import type { ConversaListItem } from "@/app/(app)/atendimento/types";

const TODOS_SETORES = "__todos__";

/** Deixa o trecho que bateu com a busca em destaque, tipo WhatsApp. */
function Realce({ texto, termo }: { texto: string; termo: string }) {
  const termoLimpo = termo.trim();
  if (!termoLimpo) return <>{texto}</>;
  const indice = texto.toLowerCase().indexOf(termoLimpo.toLowerCase());
  if (indice === -1) return <>{texto}</>;
  return (
    <>
      {texto.slice(0, indice)}
      <mark className="rounded-sm bg-primary/20 text-foreground">{texto.slice(indice, indice + termoLimpo.length)}</mark>
      {texto.slice(indice + termoLimpo.length)}
    </>
  );
}

export function ConversationList({
  conversas,
  escopo,
  setorFiltroId,
  setores,
  conversaSelecionadaId,
}: {
  conversas: ConversaListItem[];
  escopo: "minhas" | "fila" | "todas";
  setorFiltroId: string | null;
  setores: { id: string; nome: string }[];
  conversaSelecionadaId: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [busca, setBusca] = useState("");
  const [resultadosBusca, setResultadosBusca] = useState<BuscaConversaVM[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buscaAtualRef = useRef(0);

  // Debounce (250ms) feito aqui no handler, não em useEffect — sem isso,
  // cada tecla digitada dispararia uma consulta no banco. buscaAtualRef
  // descarta resposta de uma busca antiga que volte depois de uma mais
  // nova (digitou rápido, resposta chegou fora de ordem).
  function aoDigitarBusca(valor: string) {
    setBusca(valor);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const termo = valor.trim();
    if (termo.length < 2) {
      setResultadosBusca(null);
      setBuscando(false);
      return;
    }

    setBuscando(true);
    setResultadosBusca(null);
    const idDestaBusca = ++buscaAtualRef.current;
    debounceRef.current = setTimeout(async () => {
      const resultados = await buscarConversasAction(termo);
      if (buscaAtualRef.current === idDestaBusca) {
        setResultadosBusca(resultados);
        setBuscando(false);
      }
    }, 250);
  }

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== TODOS_SETORES) params.set(key, value);
    else params.delete(key);
    router.push(`/atendimento?${params.toString()}`);
  }

  function selecionar(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("conversaId", id);
    router.push(`/atendimento?${params.toString()}`);
  }

  const emBusca = busca.trim().length >= 2;

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => aoDigitarBusca(e.target.value)}
            placeholder="Pesquisar contato ou mensagem..."
            className="pl-8 pr-8"
          />
          {busca && (
            <button
              onClick={() => aoDigitarBusca("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              title="Limpar busca"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {!emBusca && (
          <>
            <div className="flex gap-1">
              {(["minhas", "fila", "todas"] as const).map((e) => (
                <button
                  key={e}
                  onClick={() => updateParam("escopo", e)}
                  className={cn(
                    "flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold capitalize transition-all",
                    escopo === e
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                      : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
            <Select value={setorFiltroId ?? TODOS_SETORES} onValueChange={(v) => updateParam("setor", v)}>
              <SelectTrigger size="sm" className="w-full">
                <SelectValue placeholder="Todos os setores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS_SETORES}>Todos os setores</SelectItem>
                {setores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </div>

      {emBusca ? (
        <ul className="flex-1 overflow-y-auto">
          {buscando && resultadosBusca === null && (
            <p className="p-4 text-center text-sm text-muted-foreground">Buscando...</p>
          )}
          {resultadosBusca !== null && resultadosBusca.length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">Nenhum resultado pra &quot;{busca}&quot;.</p>
          )}
          {resultadosBusca?.map((r) => (
            <li key={r.conversaId}>
              <button
                onClick={() => selecionar(r.conversaId)}
                className={cn(
                  "flex w-full items-start gap-2.5 border-b border-l-2 border-l-transparent p-3 text-left transition-colors hover:bg-accent/60",
                  r.conversaId === conversaSelecionadaId && "border-l-primary bg-accent",
                )}
              >
                <Avatar className="size-9 shrink-0">
                  <AvatarFallback className="bg-primary/10 font-semibold text-primary">{initials(r.contatoNome)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    <Realce texto={r.contatoNome} termo={busca} />
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    <Realce texto={r.contatoTelefone} termo={busca} />
                  </p>
                  {r.mensagemTexto && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      <Realce texto={r.mensagemTexto} termo={busca} />
                    </p>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {conversas.length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">Nenhuma conversa encontrada.</p>
          )}
          {conversas.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => selecionar(c.id)}
              className={cn(
                "flex w-full items-start gap-2.5 border-b border-l-2 border-l-transparent p-3 text-left transition-colors hover:bg-accent/60",
                c.id === conversaSelecionadaId && "border-l-primary bg-accent",
              )}
            >
              <Avatar className="size-9 shrink-0">
                <AvatarFallback className="bg-primary/10 font-semibold text-primary">{initials(c.contatoNome)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">{c.contatoNome}</p>
                  {c.status === "FILA" ? (
                    <Badge variant="secondary" className="shrink-0">
                      Fila
                    </Badge>
                  ) : (
                    <span className="shrink-0 text-[11px] text-muted-foreground">{c.atendenteNome}</span>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">{c.setorNome}</p>
                {c.ultimaMensagem && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.ultimaMensagem}</p>
                )}
              </div>
            </button>
          </li>
          ))}
        </ul>
      )}
    </div>
  );
}

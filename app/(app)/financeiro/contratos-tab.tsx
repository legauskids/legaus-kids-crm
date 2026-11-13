"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FileText, ChevronDown, Pencil } from "lucide-react";
import { salvarModeloContratoAction, atualizarStatusContratoAction, type AcaoContratoState } from "@/app/(app)/financeiro/actions";

type StatusContrato = "RASCUNHO" | "GERADO" | "ENVIADO" | "ASSINADO" | "CANCELADO";

const STATUS_LABEL: Record<StatusContrato, string> = {
  RASCUNHO: "Rascunho",
  GERADO: "Gerado",
  ENVIADO: "Enviado",
  ASSINADO: "Assinado",
  CANCELADO: "Cancelado",
};

type EmpresaEmissora = "LEGAUS" | "IDEZZA";

const EMPRESA_LABEL: Record<EmpresaEmissora, string> = {
  LEGAUS: "Legaus Kids",
  IDEZZA: "Idezza",
};

type ContratoVM = {
  id: string;
  numero: number;
  status: StatusContrato;
  criadoEm: string;
  negocioTitulo: string;
  contatoNome: string | null;
  empresaEmissora: EmpresaEmissora;
};

type CampoDisponivel = { chave: string; descricao: string };

const initialState: AcaoContratoState = {};

export function ContratosTab({
  modeloConteudo,
  camposDisponiveis,
  contratos,
  negociosParaSeletor,
}: {
  modeloConteudo: string;
  camposDisponiveis: readonly CampoDisponivel[];
  contratos: ContratoVM[];
  negociosParaSeletor: { id: string; titulo: string; contatoNome: string | null }[];
}) {
  const router = useRouter();
  const [modeloState, modeloAction, modeloPending] = useActionState(salvarModeloContratoAction, initialState);
  const [legendaAberta, setLegendaAberta] = useState(false);
  const [negocioEscolhido, setNegocioEscolhido] = useState("");
  const [, startTransition] = useTransition();

  function mudarStatus(contratoId: string, status: StatusContrato) {
    startTransition(async () => {
      await atualizarStatusContratoAction(contratoId, status);
      router.refresh();
    });
  }

  return (
    <div className="flex-1 space-y-5 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Gerar contrato pra um negócio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={negocioEscolhido}
              onChange={(e) => setNegocioEscolhido(e.target.value)}
              className="h-9 min-w-64 max-w-full rounded-md border bg-background px-2 text-sm"
              aria-label="Negócio"
            >
              <option value="">Escolha o negócio...</option>
              {negociosParaSeletor.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.titulo}
                  {n.contatoNome ? ` — ${n.contatoNome}` : ""}
                </option>
              ))}
            </select>
            {negocioEscolhido ? (
              <Button asChild size="sm">
                <Link href={`/contratos/novo?negocio=${negocioEscolhido}&voltar=financeiro`}>Preencher os dados do contrato</Link>
              </Button>
            ) : (
              <Button size="sm" disabled>
                Preencher os dados do contrato
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            O formulário pede cliente, produto, pagamento e prazos; o contrato sai em rascunho, com o texto editável antes do PDF final.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Contratos salvos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {contratos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum contrato gerado ainda.</p>
          ) : (
            contratos.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
                <div className="min-w-0">
                  <Link href={`/contratos/${c.id}`} className="block truncate font-medium text-foreground hover:underline">
                    #{String(c.numero).padStart(4, "0")} — {c.negocioTitulo}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.contatoNome ?? "sem cliente vinculado"} · {new Date(c.criadoEm).toLocaleDateString("pt-BR")} ·{" "}
                    {EMPRESA_LABEL[c.empresaEmissora]}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Link href={`/contratos/${c.id}`} className="flex items-center gap-1 text-xs text-primary underline underline-offset-2">
                    <Pencil className="size-3.5" />
                    {c.status === "RASCUNHO" ? "Editar" : "Abrir"}
                  </Link>
                  <a
                    href={`/api/pdf/contrato/${c.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-primary underline underline-offset-2"
                  >
                    <FileText className="size-3.5" />
                    PDF
                  </a>
                  <select
                    value={c.status}
                    onChange={(e) => mudarStatus(c.id, e.target.value as StatusContrato)}
                    className="h-7 rounded-md border bg-background px-1.5 text-xs"
                    aria-label="Situação do contrato"
                  >
                    {(Object.keys(STATUS_LABEL) as StatusContrato[]).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Modelo padrão de contrato</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form action={modeloAction} className="space-y-3">
            <Textarea name="conteudo" defaultValue={modeloConteudo} className="min-h-80 font-mono text-xs" spellCheck={false} />
            <div className="flex items-center gap-3">
              <Button type="submit" size="sm" disabled={modeloPending}>
                Salvar modelo
              </Button>
              {modeloState.success && <span className="text-xs text-success">Salvo — próximos contratos já usam esse texto.</span>}
              {modeloState.error && <span className="text-xs text-destructive">{modeloState.error}</span>}
            </div>
          </form>

          <button
            type="button"
            onClick={() => setLegendaAberta((a) => !a)}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={`size-3.5 transition-transform ${legendaAberta ? "rotate-180" : ""}`} />
            Campos disponíveis pra usar no texto (ex: {"{{cliente_qualificacao}}"})
          </button>
          {legendaAberta && (
            <div className="grid grid-cols-1 gap-x-4 gap-y-1 rounded-md bg-muted/50 p-3 text-xs sm:grid-cols-2">
              {camposDisponiveis.map((c) => (
                <p key={c.chave}>
                  <code className="rounded bg-background px-1 py-0.5 font-mono text-[11px]">{`{{${c.chave}}}`}</code>{" "}
                  <span className="text-muted-foreground">{c.descricao}</span>
                </p>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Uma linha em branco separa os parágrafos; a primeira linha é o título. Editar o modelo não altera contratos já gerados — cada um guarda o
            texto de quando foi criado.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

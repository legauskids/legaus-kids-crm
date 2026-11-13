"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, ChevronDown, Eye, FileDown, FileText, Loader2, Lock, Pencil, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatarDocumento } from "@/lib/utils/busca-cliente";
import { centavosParaReais } from "@/lib/utils/money";
import { EMPRESA_CONTRATO_LABEL, dadosContratoSchema, type DadosContrato } from "@/lib/utils/contrato";
import { FormularioContrato } from "@/app/(app)/contratos/formulario-contrato";
import { PreviaContrato } from "@/app/(app)/contratos/previa-contrato";
import {
  atualizarDadosContratoAction,
  finalizarContratoAction,
  mudarStatusContratoAction,
  reabrirContratoAction,
  salvarTextoContratoAction,
} from "@/app/(app)/contratos/actions";

// Tela do contrato (pedido de 2026-11-12): 1) dados do formulário, 2) texto
// editável — salva sozinho enquanto digita —, 3) PDF final. Rascunho em PDF e
// Word dá pra baixar a qualquer momento.

type Status = "RASCUNHO" | "GERADO" | "ENVIADO" | "ASSINADO" | "CANCELADO";
type Estado = "salvo" | "alterado" | "salvando" | "erro";

const TEXTO_ESTADO: Record<Estado, string> = {
  salvo: "Salvo.",
  alterado: "Salvando...",
  salvando: "Salvando...",
  erro: "Não salvou — mude algo pra tentar de novo.",
};

const STATUS_FINALIZADO_LABEL: Record<Exclude<Status, "RASCUNHO">, string> = {
  GERADO: "Gerado (PDF final)",
  ENVIADO: "Enviado ao cliente",
  ASSINADO: "Assinado",
  CANCELADO: "Cancelado",
};

const FALTANDO = "[não informado]";

function Passo({ numero, titulo, ativo, feito }: { numero: number; titulo: string; ativo: boolean; feito: boolean }) {
  return (
    <li className={cn("flex items-center gap-2 text-sm", ativo ? "font-semibold text-foreground" : "text-muted-foreground")}>
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs",
          feito ? "border-success bg-success text-success-foreground" : ativo ? "border-primary text-primary" : "",
        )}
      >
        {feito ? <CheckCircle2 className="size-4" /> : numero}
      </span>
      {titulo}
    </li>
  );
}

function ResumoDados({ dados }: { dados: DadosContrato }) {
  const linhas: [string, string][] = [
    ["Quem vende", EMPRESA_CONTRATO_LABEL[dados.empresaEmissora]],
    [
      "Cliente",
      [dados.clienteNome, formatarDocumento(dados.clienteDocumento) && `${dados.clienteTipo === "PJ" ? "CNPJ" : "CPF"} ${formatarDocumento(dados.clienteDocumento)}`]
        .filter(Boolean)
        .join(" · ") || "—",
    ],
    ["Produto", dados.produto.split("\n")[0] + (dados.produto.includes("\n") ? " (+ outros)" : "") || "—"],
    ["Valor", dados.valorCentavos > 0 ? centavosParaReais(dados.valorCentavos) : "—"],
    ["Pagamento", dados.formaPagamento || "—"],
    ["Prazos", `entrega em ${dados.prazoEntregaDias} dias · garantia de ${dados.garantiaMeses} meses`],
  ];
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
      {linhas.map(([rotulo, valor]) => (
        <div key={rotulo} className="contents">
          <dt className="text-muted-foreground">{rotulo}</dt>
          <dd className="truncate text-foreground">{valor}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EditorContrato({
  contratoId,
  numero,
  status,
  conteudoInicial,
  dadosIniciais,
  origemProduto,
}: {
  contratoId: string;
  numero: string;
  status: Status;
  conteudoInicial: string;
  dadosIniciais: DadosContrato;
  origemProduto: string | null;
}) {
  const router = useRouter();
  const rascunho = status === "RASCUNHO";
  const [texto, setTexto] = useState(conteudoInicial);
  const [dados, setDados] = useState(dadosIniciais);
  const dadosCompletos = dadosContratoSchema.safeParse(dados).success;
  const [dadosAbertos, setDadosAbertos] = useState(rascunho && !dadosCompletos);
  const [versaoFormulario, setVersaoFormulario] = useState(0);
  const [aba, setAba] = useState<"editar" | "ver">("editar");
  const [estado, setEstado] = useState<Estado>("salvo");
  const [versao, setVersao] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, startAcao] = useTransition();

  const textoRef = useRef(texto);
  const filaRef = useRef<Promise<unknown>>(Promise.resolve());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimaVersaoRef = useRef(0);

  const urlPdf = `/api/pdf/contrato/${contratoId}`;
  const urlWord = `/api/pdf/contrato/${contratoId}/word`;
  const temFaltando = texto.includes(FALTANDO);

  function mudarTexto(novo: string) {
    textoRef.current = novo;
    setTexto(novo);
    setEstado("alterado");
    setVersao((v) => v + 1);
  }

  /** Salva já (em fila, pra não chegar fora de ordem no servidor). */
  function salvarAgora(): Promise<boolean> {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const minha = ++ultimaVersaoRef.current;
    const conteudo = textoRef.current;
    setEstado("salvando");
    const resultado = filaRef.current.then(() => salvarTextoContratoAction(contratoId, conteudo));
    filaRef.current = resultado.catch(() => null);
    return resultado.then(
      (r) => {
        const ok = "ok" in r;
        if (minha === ultimaVersaoRef.current) setEstado(ok ? "salvo" : "erro");
        if (!ok) setErro(r.error);
        return ok;
      },
      () => {
        if (minha === ultimaVersaoRef.current) setEstado("erro");
        return false;
      },
    );
  }

  // Salva sozinho pouco depois de parar de digitar.
  useEffect(() => {
    if (versao === 0) return;
    timerRef.current = setTimeout(() => void salvarAgora(), 900);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- salvarAgora lê tudo por ref
  }, [versao]);

  // Avisa antes de sair com mudança ainda não salva.
  useEffect(() => {
    if (estado === "salvo") return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [estado]);

  /** Abre o PDF numa aba nova depois de salvar o que falta (a aba abre na hora, pro navegador não bloquear). */
  async function abrirPdf() {
    if (estado === "salvo") return void window.open(`${urlPdf}?ver=1`, "_blank", "noopener");
    const janela = window.open("", "_blank");
    const ok = await salvarAgora();
    if (!janela) return;
    if (ok) janela.location.href = `${urlPdf}?ver=1`;
    else janela.close();
  }

  async function baixarWord() {
    if (estado !== "salvo" && !(await salvarAgora())) return;
    const link = document.createElement("a");
    link.href = urlWord;
    link.click();
  }

  async function aplicarDados(novos: DadosContrato) {
    if (!confirm("Refazer o texto do contrato com estes dados? O que foi mudado à mão no texto se perde.")) return;
    // Descarta o salvamento pendente do texto antigo e espera o que já foi.
    if (timerRef.current) clearTimeout(timerRef.current);
    ultimaVersaoRef.current++;
    await filaRef.current;
    const r = await atualizarDadosContratoAction(contratoId, novos);
    if ("error" in r) return r;
    textoRef.current = r.conteudo;
    setTexto(r.conteudo);
    setEstado("salvo");
    setDados(novos);
    setDadosAbertos(false);
    setErro(null);
    toast.success("Texto refeito com os dados novos — confira no passo 2.");
    router.refresh();
  }

  function finalizar() {
    setErro(null);
    if (temFaltando) {
      setErro(`Ainda tem ${FALTANDO} no texto — complete os dados do contrato (passo 1) ou corrija o texto.`);
      return;
    }
    if (!confirm(`Finalizar o contrato nº ${numero}? O PDF sai sem a marca de rascunho. Dá pra reabrir depois, se precisar mudar.`)) return;
    startAcao(async () => {
      if (estado !== "salvo" && !(await salvarAgora())) return;
      const r = await finalizarContratoAction(contratoId);
      if ("error" in r) return void setErro(r.error);
      toast.success("Contrato finalizado — o PDF final está pronto.");
      router.refresh();
    });
  }

  function reabrir() {
    if (status === "ENVIADO" && !confirm("Esse contrato já foi enviado ao cliente. Reabrir pra mudar o texto mesmo assim?")) return;
    startAcao(async () => {
      const r = await reabrirContratoAction(contratoId);
      if ("error" in r) return void setErro(r.error);
      router.refresh();
    });
  }

  function mudarStatus(novo: Exclude<Status, "RASCUNHO">) {
    startAcao(async () => {
      const r = await mudarStatusContratoAction(contratoId, novo);
      if ("error" in r) return void setErro(r.error);
      router.refresh();
    });
  }

  if (!rascunho) {
    return (
      <div className="space-y-5">
        <div className="flex flex-col gap-3 rounded-xl border border-success/30 bg-success/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <Lock className="mt-0.5 size-4 shrink-0 text-success" />
            <div>
              <p className="text-sm font-semibold text-foreground">Contrato finalizado</p>
              <p className="text-xs text-muted-foreground">O texto está travado. Pra mudar, reabra — ele volta a ser rascunho.</p>
            </div>
          </div>
          <select
            value={status}
            disabled={ocupado}
            onChange={(e) => mudarStatus(e.target.value as Exclude<Status, "RASCUNHO">)}
            className="h-8 rounded-md border bg-background px-2 text-sm"
            aria-label="Situação do contrato"
          >
            {(Object.keys(STATUS_FINALIZADO_LABEL) as Exclude<Status, "RASCUNHO">[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_FINALIZADO_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <a href={urlPdf}>
              <FileDown className="size-4" />
              Baixar PDF
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={`${urlPdf}?ver=1`} target="_blank" rel="noreferrer">
              <Eye className="size-4" />
              Ver PDF
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={urlWord}>
              <FileText className="size-4" />
              Baixar em Word
            </a>
          </Button>
          {(status === "GERADO" || status === "ENVIADO") && (
            <Button variant="ghost" onClick={reabrir} disabled={ocupado}>
              <RotateCcw className="size-4" />
              Reabrir pra editar
            </Button>
          )}
        </div>
        {erro && <p className="text-sm text-destructive">{erro}</p>}

        <PreviaContrato conteudo={texto} numero={numero} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ol className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Passo numero={1} titulo="Dados do contrato" ativo={dadosAbertos} feito={dadosCompletos && !dadosAbertos} />
        <Passo numero={2} titulo="Conferir e editar o texto" ativo={!dadosAbertos} feito={false} />
        <Passo numero={3} titulo="Finalizar (PDF final)" ativo={false} feito={false} />
      </ol>

      <section className="rounded-xl border bg-card shadow-sm">
        <button
          type="button"
          onClick={() => setDadosAbertos((a) => !a)}
          aria-expanded={dadosAbertos}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <span className="text-sm font-semibold text-foreground">1. Dados do contrato</span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {dadosCompletos ? "Completos" : <span className="font-medium text-destructive">Faltam dados</span>}
            <ChevronDown className={cn("size-4 transition-transform", dadosAbertos && "rotate-180")} />
          </span>
        </button>
        <div className="border-t px-4 py-4">
          {dadosAbertos ? (
            <FormularioContrato
              key={versaoFormulario}
              inicial={dados}
              origemProduto={origemProduto}
              textoBotao="Refazer o texto com estes dados"
              onEnviar={aplicarDados}
              extras={
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setDadosAbertos(false);
                    setVersaoFormulario((v) => v + 1);
                  }}
                >
                  Cancelar
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <ResumoDados dados={dados} />
              <Button size="sm" variant="outline" onClick={() => setDadosAbertos(true)}>
                <Pencil className="size-3.5" />
                Mudar dados
              </Button>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">2. Texto do contrato</h2>
          <div className="flex items-center gap-3">
            <span className={cn("text-xs", estado === "erro" ? "text-destructive" : "text-muted-foreground")} aria-live="polite">
              {TEXTO_ESTADO[estado]}
            </span>
            <div role="tablist" className="inline-flex rounded-lg border bg-muted/40 p-0.5">
              {(
                [
                  ["editar", "Editar"],
                  ["ver", "Ver como fica"],
                ] as const
              ).map(([valor, rotulo]) => (
                <button
                  key={valor}
                  type="button"
                  role="tab"
                  aria-selected={aba === valor}
                  onClick={() => setAba(valor)}
                  className={cn(
                    "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                    aba === valor ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {rotulo}
                </button>
              ))}
            </div>
          </div>
        </div>

        {aba === "editar" ? (
          <>
            <p className="text-xs text-muted-foreground">
              Uma linha em branco separa os parágrafos. A primeira linha é o título; linhas que começam com número e traço (ex: “2 - Da mora”)
              saem em negrito. Mudanças aqui valem só pra este contrato.
            </p>
            <Textarea
              value={texto}
              onChange={(e) => mudarTexto(e.target.value)}
              spellCheck
              lang="pt-BR"
              aria-label="Texto do contrato"
              className="min-h-[60vh] p-4 text-[15px] leading-7 md:text-[15px]"
            />
          </>
        ) : (
          <PreviaContrato conteudo={texto} numero={numero} className="shadow-none" />
        )}
        {temFaltando && (
          <p className="text-sm text-destructive">
            O texto ainda tem {FALTANDO} — complete os dados do contrato (passo 1) ou corrija aqui antes de finalizar.
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground">3. Rascunho e PDF final</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={abrirPdf}>
            <Eye className="size-4" />
            Ver rascunho em PDF
          </Button>
          <Button variant="outline" onClick={baixarWord}>
            <FileText className="size-4" />
            Baixar em Word
          </Button>
          <Button onClick={finalizar} disabled={ocupado}>
            {ocupado ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            Finalizar contrato
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          O rascunho sai com a marca “Rascunho”. Depois de finalizar, o PDF sai limpo, pronto pra assinatura.
        </p>
        {erro && <p className="text-sm text-destructive">{erro}</p>}
      </section>
    </div>
  );
}

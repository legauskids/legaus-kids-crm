import { URL_BASE } from "../constants/app";
import { diaDaSemana, somarDias } from "./brasilia";
import { dataBR, prazoLegivel, rotuloParcela } from "./contas-pagar";
import type { Botoes } from "./agente-canal";

// Avisos diários das contas a pagar (pedido de 2026-11-23, etapa 3): às 8h,
// as atrasadas, as que vencem hoje e as dos próximos 3 dias; às 17h, as que
// vencem hoje e ainda estão em aberto. Telegram e WhatsApp (só o número
// pessoal do Marcos, por enquanto). No Telegram, cada conta ganha o botão
// "Já paguei" (ver lerBotao: jp/jh/jl/ju). Puro e testável.

export type TurnoAviso = "MANHA" | "TARDE";

/** Hora de Brasília em que cada aviso pode sair: começa às 8h/17h e, se o relógio estava parado, ainda sai até 2h depois. */
export const JANELA_AVISO: Record<TurnoAviso, { de: number; ate: number }> = { MANHA: { de: 8, ate: 10 }, TARDE: { de: 17, ate: 19 } };
export const DIAS_A_FRENTE_MANHA = 3;
/** Linhas por grupo na mensagem; o resto vira "… e mais N". */
const MAX_LINHAS_GRUPO = 10;
const MAX_BOTOES_PAGUEI = 8;
export const LINK_CONTAS_PAGAR = `${URL_BASE}/financeiro?aba=contas-pagar`;

export function horaBrasilia(agora: Date): number {
  return Number(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }));
}

/** O aviso que pode sair agora, ou null fora das janelas. */
export function turnoDoMomento(agora: Date): TurnoAviso | null {
  const hora = horaBrasilia(agora);
  for (const turno of ["MANHA", "TARDE"] as const) {
    if (hora >= JANELA_AVISO[turno].de && hora < JANELA_AVISO[turno].ate) return turno;
  }
  return null;
}

/** Primeiro dia que fica de fora do aviso (o vencimento tem que ser antes dele). */
export function limiteDoAviso(turno: TurnoAviso, hoje: string): string {
  return somarDias(hoje, turno === "MANHA" ? DIAS_A_FRENTE_MANHA + 1 : 1);
}

export type ContaDoAviso = {
  id: string;
  vencimento: string;
  valorCentavos: number;
  fornecedor: string;
  parcela: number | null;
  totalParcelas: number | null;
};

export type CanalAviso = "telegram" | "whatsapp";

function reais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\s/g, " ");
}

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function nome(c: ContaDoAviso): string {
  const parcela = rotuloParcela(c.parcela, c.totalParcelas);
  return `${c.fornecedor}${parcela ? ` (${parcela})` : ""}`;
}

function soma(contas: ContaDoAviso[]): number {
  return contas.reduce((total, c) => total + c.valorCentavos, 0);
}

function grupo(icone: string, titulo: string, contas: ContaDoAviso[], linha: (c: ContaDoAviso) => string): string[] {
  if (!contas.length) return [];
  const linhas = [`${icone} *${titulo} — ${reais(soma(contas))}*`, ...contas.slice(0, MAX_LINHAS_GRUPO).map((c) => `• ${linha(c)}`)];
  if (contas.length > MAX_LINHAS_GRUPO) linhas.push(`• … e mais ${contas.length - MAX_LINHAS_GRUPO}`);
  return ["", ...linhas];
}

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

/** Botão "Já paguei" de cada conta (Telegram), na ordem da mensagem. */
export function botoesPaguei(contas: ContaDoAviso[]): Botoes {
  return contas.slice(0, MAX_BOTOES_PAGUEI).map((c) => {
    const fornecedor = c.fornecedor.length > 22 ? `${c.fornecedor.slice(0, 21)}…` : c.fornecedor;
    return [{ texto: `✅ Já paguei: ${fornecedor} · ${reais(c.valorCentavos)}`, dados: `jp:${c.id}` }];
  });
}

/**
 * A mensagem do aviso, ou null se não há nada para avisar. `contas` são as
 * abertas com vencimento antes de limiteDoAviso (em qualquer ordem);
 * `rascunhos` são as que vieram do WhatsApp/Telegram e ninguém confirmou.
 */
export function montarAvisoContas(input: {
  turno: TurnoAviso;
  hoje: string;
  contas: ContaDoAviso[];
  rascunhos?: number;
  canal: CanalAviso;
}): { mensagem: string; botoes?: Botoes } | null {
  const { turno, hoje, canal } = input;
  const contas = [...input.contas].sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.fornecedor.localeCompare(b.fornecedor));
  const atrasadas = turno === "MANHA" ? contas.filter((c) => c.vencimento < hoje) : [];
  const deHoje = contas.filter((c) => c.vencimento === hoje);
  const proximas = turno === "MANHA" ? contas.filter((c) => c.vencimento > hoje && c.vencimento < limiteDoAviso(turno, hoje)) : [];
  const rascunhos = turno === "MANHA" ? (input.rascunhos ?? 0) : 0;
  const avisadas = [...atrasadas, ...deHoje, ...proximas];
  if (!avisadas.length && !rascunhos) return null;

  const linhas: string[] = [];
  if (turno === "MANHA") {
    linhas.push("☀️ Bom dia! *Contas a pagar*");
    linhas.push(...grupo("🔴", "Atrasadas", atrasadas, (c) => `${dataBR(c.vencimento).slice(0, 5)} — ${nome(c)} — ${reais(c.valorCentavos)} (${prazoLegivel(c.vencimento, hoje)})`));
    linhas.push(...grupo("📌", deHoje.length === 1 ? "Vence hoje" : "Vencem hoje", deHoje, (c) => `${nome(c)} — ${reais(c.valorCentavos)}`));
    linhas.push(
      ...grupo("🗓️", `Próximos ${DIAS_A_FRENTE_MANHA} dias`, proximas, (c) => `${SEMANA[diaDaSemana(c.vencimento)]} ${dataBR(c.vencimento).slice(0, 5)} — ${nome(c)} — ${reais(c.valorCentavos)}`),
    );
    if (avisadas.length > 1) linhas.push("", `Total: *${reais(soma(avisadas))}* em ${plural(avisadas.length, "conta", "contas")}.`);
    if (rascunhos) {
      linhas.push(
        "",
        `📝 ${rascunhos === 1 ? "1 conta que veio" : `${rascunhos} contas que vieram`} pelo WhatsApp/Telegram ainda ${rascunhos === 1 ? "espera" : "esperam"} confirmação (aba Contas a pagar → A confirmar).`,
      );
    }
  } else {
    linhas.push(`⏰ *Ainda em aberto — ${deHoje.length === 1 ? "vence" : "vencem"} hoje* (${reais(soma(deHoje))})`);
    linhas.push(...deHoje.map((c) => `• ${nome(c)} — ${reais(c.valorCentavos)}`));
  }

  if (avisadas.length) {
    linhas.push(
      "",
      canal === "telegram"
        ? `Pagou? Toque em *Já paguei* — a conta fica paga e vira despesa aguardando o extrato.${avisadas.length > MAX_BOTOES_PAGUEI ? " As outras, marque no CRM." : ""}`
        : "Pagou? Marque como paga no CRM, em Financeiro → Contas a pagar.",
    );
  }
  linhas.push(LINK_CONTAS_PAGAR);
  return { mensagem: linhas.join("\n"), botoes: canal === "telegram" && avisadas.length ? botoesPaguei(avisadas) : undefined };
}

// "Já paguei" (Telegram): sem pagamento já registrado com o valor da conta,
// marca como paga hoje e cria a despesa; com, pergunta se é um deles.

export type DespesaCandidata = { id: string; dia: string; fornecedor: string; valorCentavos: number };

export function botoesDeCandidatas(contaId: string, despesas: DespesaCandidata[]): Botoes {
  return [
    ...despesas.slice(0, 3).map((d) => {
      const fornecedor = d.fornecedor.length > 24 ? `${d.fornecedor.slice(0, 23)}…` : d.fornecedor;
      return [{ texto: `🔗 É este: ${dataBR(d.dia).slice(0, 5)} · ${fornecedor}`, dados: `jl:${contaId}:${d.id}` }];
    }),
    [{ texto: "➕ Não, registrar o pagamento de hoje", dados: `jh:${contaId}` }],
  ];
}

export function mensagemCandidatas(conta: ContaDoAviso, despesas: DespesaCandidata[]): string {
  const lista = despesas.slice(0, 3).map((d) => `• ${dataBR(d.dia)} — ${d.fornecedor} — ${reais(d.valorCentavos)}`);
  return [
    `💡 Já tem ${despesas.length === 1 ? "um pagamento registrado" : "pagamentos registrados"} com o valor da conta *${nome(conta)}* (${reais(conta.valorCentavos)}):`,
    ...lista,
    "",
    despesas.length === 1 ? "É este? Se for, eu ligo à conta (sem duplicar a despesa)." : "É um destes? Se for, eu ligo à conta (sem duplicar a despesa).",
  ].join("\n");
}

export function mensagemContaPaga(conta: ContaDoAviso, comDespesaExistente: boolean): string {
  return comDespesaExistente
    ? `✅ *${nome(conta)}* (${reais(conta.valorCentavos)}, vencimento ${dataBR(conta.vencimento)}) marcada como paga com o pagamento que já estava registrado.`
    : `✅ *${nome(conta)}* (${reais(conta.valorCentavos)}, vencimento ${dataBR(conta.vencimento)}) marcada como paga hoje. A despesa fica aguardando o extrato.`;
}

export function botaoDesfazerPagamento(contaId: string): Botoes {
  return [[{ texto: "↩️ Desfazer", dados: `ju:${contaId}` }]];
}

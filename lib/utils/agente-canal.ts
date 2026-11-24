// Núcleo do agente independente de canal (pedido de 2026-10-07): a resposta
// do agente é neutra — texto + escolhas — e cada canal só desenha do seu
// jeito (Telegram: botões; WhatsApp: enquete; chat do CRM: texto). Quem
// decide o que cada botão faz é o núcleo (lib/server/agente-botoes.ts),
// nunca o adaptador do canal. Puro e testável.

export type CanalAgente = "whatsapp" | "telegram" | "crm";

/** A conversa: telefone (WhatsApp), "tg:<id>" (Telegram) ou "crm:<userId>" (chat do CRM). */
export function canalDoIdentificador(identificador: string): CanalAgente {
  if (identificador.startsWith("crm:")) return "crm";
  if (identificador.startsWith("tg:")) return "telegram";
  return "whatsapp";
}

/** Botão: o texto e os dados que voltam pro núcleo quando tocado (até 64 bytes no Telegram). */
export type Botao = { texto: string; dados: string };
export type Botoes = Botao[][];

export const LIMITE_DADOS_BOTAO = 64;

/**
 * O que um botão tocado pede. Formatos (o id da despesa é cuid, 25 letras):
 *   d:<acao>:<despesaId>             ok confirmar · co corrigir · x descartar · ng é de um negócio
 *                                    vc ver categorias · vg ver centros · re mostrar de novo
 *                                    u desfazer registro · ou é outra despesa (não a parecida)
 *   dc:<despesaId>:<prefixoCategoria> escolhe a categoria (8 primeiras letras do id)
 *   dg:<despesaId>:<centroGeralId>    escolhe o centro geral
 *   dj:<despesaId>:<existenteId>      é a mesma despesa já registrada: juntar
 *   ca:<comandoId> / cx:<comandoId>   confirma / cancela a ação pendente do agente
 *   an:<avisoId>:<negocioId>          entrada do push: é desse negócio
 *   ax:<avisoId>                      entrada do push: não é de negócio
 * Contas a pagar (2026-11-23):
 *   cp:<acao>:<contaId>               ok confirmar · co corrigir · x descartar · ng é de um negócio
 *                                    vc ver categorias · vg ver centros · re mostrar de novo
 *   cpc:<contaId>:<prefixoCategoria>  escolhe a categoria
 *   cpg:<contaId>:<centroGeralId>     escolhe o centro geral
 *   pg:<contaId>:<despesaId>          o pagamento (despesa) é dessa conta: ligar
 *   pn:<despesaId>                    não é pagamento de conta
 * "Já paguei" do aviso diário (2026-11-24):
 *   jp:<contaId>                      já paguei (pergunta se é uma despesa já registrada)
 *   jh:<contaId>                      registrar o pagamento de hoje
 *   jl:<contaId>:<despesaId>          o pagamento é essa despesa já registrada: ligar
 *   ju:<contaId>                      desfazer o pagamento
 */
export type PedidoBotao =
  | { tipo: "despesa"; acao: "ok" | "co" | "x" | "ng" | "vc" | "vg" | "re" | "u" | "ou"; despesaId: string }
  | { tipo: "categoria"; despesaId: string; prefixo: string }
  | { tipo: "centro"; despesaId: string; centroGeralId: string }
  | { tipo: "juntar"; despesaId: string; existenteId: string }
  | { tipo: "pendente"; confirmar: boolean; comandoId: string }
  | { tipo: "aviso-negocio"; avisoId: string; negocioId: string }
  | { tipo: "aviso-ignorar"; avisoId: string }
  | { tipo: "conta"; acao: "ok" | "co" | "x" | "ng" | "vc" | "vg" | "re"; contaId: string }
  | { tipo: "conta-categoria"; contaId: string; prefixo: string }
  | { tipo: "conta-centro"; contaId: string; centroGeralId: string }
  | { tipo: "pagamento"; contaId: string; despesaId: string }
  | { tipo: "pagamento-nao"; despesaId: string }
  | { tipo: "paguei"; acao: "jp" | "jh" | "ju"; contaId: string }
  | { tipo: "paguei-ligar"; contaId: string; despesaId: string };

const ACOES_DESPESA = new Set(["ok", "co", "x", "ng", "vc", "vg", "re", "u", "ou"]);
const ACOES_CONTA = new Set(["ok", "co", "x", "ng", "vc", "vg", "re"]);
const ID = /^[\w-]{1,40}$/;

export function lerBotao(dados: string | null | undefined): PedidoBotao | null {
  const partes = (dados ?? "").split(":");
  const [prefixo, a, b] = partes;
  const ok = (...ids: (string | undefined)[]) => ids.every((i) => i !== undefined && ID.test(i));
  switch (prefixo) {
    case "d":
      return partes.length === 3 && ACOES_DESPESA.has(a) && ok(b) ? { tipo: "despesa", acao: a as never, despesaId: b } : null;
    case "dc":
      return partes.length === 3 && ok(a, b) ? { tipo: "categoria", despesaId: a, prefixo: b } : null;
    case "dg":
      return partes.length === 3 && ok(a, b) ? { tipo: "centro", despesaId: a, centroGeralId: b } : null;
    case "dj":
      return partes.length === 3 && ok(a, b) ? { tipo: "juntar", despesaId: a, existenteId: b } : null;
    case "ca":
    case "cx":
      return partes.length === 2 && ok(a) ? { tipo: "pendente", confirmar: prefixo === "ca", comandoId: a } : null;
    case "an":
      return partes.length === 3 && ok(a, b) ? { tipo: "aviso-negocio", avisoId: a, negocioId: b } : null;
    case "ax":
      return partes.length === 2 && ok(a) ? { tipo: "aviso-ignorar", avisoId: a } : null;
    case "cp":
      return partes.length === 3 && ACOES_CONTA.has(a) && ok(b) ? { tipo: "conta", acao: a as never, contaId: b } : null;
    case "cpc":
      return partes.length === 3 && ok(a, b) ? { tipo: "conta-categoria", contaId: a, prefixo: b } : null;
    case "cpg":
      return partes.length === 3 && ok(a, b) ? { tipo: "conta-centro", contaId: a, centroGeralId: b } : null;
    case "pg":
      return partes.length === 3 && ok(a, b) ? { tipo: "pagamento", contaId: a, despesaId: b } : null;
    case "pn":
      return partes.length === 2 && ok(a) ? { tipo: "pagamento-nao", despesaId: a } : null;
    case "jp":
    case "jh":
    case "ju":
      return partes.length === 2 && ok(a) ? { tipo: "paguei", acao: prefixo, contaId: a } : null;
    case "jl":
      return partes.length === 3 && ok(a, b) ? { tipo: "paguei-ligar", contaId: a, despesaId: b } : null;
    default:
      return null;
  }
}

/** Botões em linhas de `porLinha`. */
export function emLinhas(botoes: Botao[], porLinha = 2): Botoes {
  const linhas: Botoes = [];
  for (let i = 0; i < botoes.length; i += porLinha) linhas.push(botoes.slice(i, i + porLinha));
  return linhas;
}

function escaparHtml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * O agente escreve no estilo WhatsApp (*negrito*, _itálico_); o Telegram
 * recebe em HTML. Só converte marcação que abre e fecha na mesma linha, com
 * borda de palavra — "arquivo_final_v2" e "2*3*4" ficam como estão.
 */
export function paraHtmlTelegram(texto: string): string {
  return escaparHtml(texto)
    .replace(/(^|[\s(“"'])\*([^*\n]+?)\*(?=$|[\s).,!?:;”"'])/gm, "$1<b>$2</b>")
    .replace(/(^|[\s(“"'])_([^_\n]+?)_(?=$|[\s).,!?:;”"'])/gm, "$1<i>$2</i>");
}

/** O Telegram aceita até 4096 caracteres por mensagem: quebra em parágrafos, depois em linhas. */
export function dividirMensagem(texto: string, limite = 4000): string[] {
  if (texto.length <= limite) return [texto];
  const partes: string[] = [];
  let atual = "";
  for (const linha of texto.split("\n")) {
    const candidata = atual ? `${atual}\n${linha}` : linha;
    if (candidata.length <= limite) {
      atual = candidata;
      continue;
    }
    if (atual) partes.push(atual);
    if (linha.length <= limite) atual = linha;
    else {
      for (let i = 0; i < linha.length; i += limite) partes.push(linha.slice(i, i + limite));
      atual = "";
    }
  }
  if (atual) partes.push(atual);
  return partes;
}

/**
 * O agente está ligado nesse canal pra esse usuário? (User.canaisAgente:
 * { "whatsapp": { "comandos": false } } desliga só os comandos internos do
 * WhatsApp, sem mexer no atendimento.) Chave ausente = ligado.
 */
export function agenteLigado(canaisAgente: unknown, canal: CanalAgente): boolean {
  const config = (canaisAgente ?? {}) as Partial<Record<CanalAgente, { comandos?: boolean }>>;
  return config[canal]?.comandos !== false;
}

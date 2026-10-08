// Leitura da notificação (push) do app do Sicredi, encaminhada pelo
// MacroDroid no celular do Marcos (decisão de 2026-10-07). Pura e testável.
//
// Padrão confirmado pelo Marcos (print de 07/10/2026):
//   título: "Sicredi Pix"
//   texto:  "Você pagou um Pix no valor de R$ 0,01
//            Marcos Zancan CPF ###.598.010-##
//            Banco Cooperativo Sicredi S.a.
//            07/10/2026 - 10:27:48
//            Aproveite todas vantagens do Pix no Sicredi."
//
// O Android às vezes entrega só a primeira linha (notificação recolhida):
// aí vale o que der pra ler (direção e valor) e a hora em que chegou.

export type DirecaoPush = "SAIDA" | "ENTRADA";

export type PushLido = {
  direcao: DirecaoPush;
  valorCentavos: number;
  /** Quem recebeu (saída) ou quem mandou (entrada), como veio na notificação. */
  contraparte: string | null;
  /** CPF/CNPJ mascarado como o Sicredi manda ("###.598.010-##"). */
  documento: string | null;
  banco: string | null;
  /** "AAAA-MM-DDTHH:mm:ss" no horário de Brasília, quando veio na notificação. */
  dataHora: string | null;
  meio: "PIX" | "OUTRO";
};

const VALOR = /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/;
const DATA_HORA = /(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2}):(\d{2})(?::(\d{2}))?/;
const CONTRAPARTE = /^(.+?)\s+(CPF|CNPJ)\s+([#\d.\/-]+)\s*$/i;

function centavos(valor: string): number {
  return Number(valor.replace(/\./g, "").replace(",", ""));
}

function direcaoDoTexto(texto: string): DirecaoPush | null {
  if (/\b(recebeu|recebido|recebimento|cr[eé]dito)\b/i.test(texto)) return "ENTRADA";
  if (/\b(pagou|pago|pagamento|enviou|enviado|transferiu|compra|d[eé]bito)\b/i.test(texto)) return "SAIDA";
  return null;
}

/** null quando não é uma notificação de movimentação (propaganda, aviso, etc.). */
export function lerPushSicredi(titulo: string | null | undefined, texto: string | null | undefined): PushLido | null {
  const corpo = (texto ?? "").replace(/\r/g, "");
  const tudo = `${titulo ?? ""}\n${corpo}`;
  const valor = corpo.match(VALOR) ?? tudo.match(VALOR);
  const direcao = direcaoDoTexto(corpo) ?? direcaoDoTexto(titulo ?? "");
  if (!valor || !direcao) return null;

  const linhas = corpo.split("\n").map((l) => l.trim()).filter(Boolean);
  const iValor = linhas.findIndex((l) => VALOR.test(l));
  let contraparte: string | null = null;
  let documento: string | null = null;
  let banco: string | null = null;
  for (let i = iValor + 1; i < linhas.length; i++) {
    const m = linhas[i].match(CONTRAPARTE);
    if (m) {
      contraparte = m[1].trim();
      documento = m[3];
      const proxima = linhas[i + 1];
      if (proxima && !DATA_HORA.test(proxima) && !/aproveite/i.test(proxima)) banco = proxima;
      break;
    }
  }

  const d = tudo.match(DATA_HORA);
  const dataHora = d ? `${d[3]}-${d[2]}-${d[1]}T${d[4]}:${d[5]}:${d[6] ?? "00"}` : null;

  return {
    direcao,
    valorCentavos: centavos(valor[1]),
    contraparte,
    documento,
    banco,
    dataHora,
    meio: /\bpix\b/i.test(tudo) ? "PIX" : "OUTRO",
  };
}

/** Botões da entrada: um negócio por linha + "não é de negócio". */
export function botoesDeEntrada(avisoId: string, negocios: { id: string; titulo: string }[]): { texto: string; dados: string }[][] {
  const linhas = negocios.map((n) => [{ texto: n.titulo.length > 48 ? `${n.titulo.slice(0, 47)}…` : n.titulo, dados: `an:${avisoId}:${n.id}` }]);
  return [...linhas, [{ texto: "🚫 Não é de negócio", dados: `ax:${avisoId}` }]];
}

/**
 * Negócio que o Marcos já disse no push de uma ENTRADA, pra pré-selecionar
 * na linha do extrato: mesmo valor, até 2 dias de diferença, o mais próximo.
 */
export function negocioDoAviso(
  linha: { dia: string; valorCentavos: number; tipo: "ENTRADA" | "SAIDA" },
  avisos: { negocioId: string; valorCentavos: number; dia: string }[],
): string | null {
  if (linha.tipo !== "ENTRADA") return null;
  const distancia = (a: string, b: string) => Math.abs(new Date(`${a}T12:00:00Z`).getTime() - new Date(`${b}T12:00:00Z`).getTime()) / 86_400_000;
  const candidatos = avisos
    .filter((a) => a.valorCentavos === linha.valorCentavos && distancia(a.dia, linha.dia) <= 2)
    .sort((a, b) => distancia(a.dia, linha.dia) - distancia(b.dia, linha.dia));
  return candidatos[0]?.negocioId ?? null;
}

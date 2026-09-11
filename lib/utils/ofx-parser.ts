// Parser de extrato bancário OFX — cobre tanto OFX 1.x (SGML, tags de valor
// sem fechamento, comum em banco brasileiro) quanto OFX 2.x (XML de
// verdade), já que os dois fecham os blocos (</STMTTRN> etc.) mesmo quando
// não fecham as tags de valor — extrair por regex em vez de exigir um
// parser XML de verdade evita quebrar no formato antigo.

export type TransacaoOfx = {
  data: Date;
  descricao: string;
  valorCentavos: number;
  tipo: "ENTRADA" | "SAIDA";
  fitId: string | null;
};

export type ExtratoOfx = {
  periodoInicio: Date | null;
  periodoFim: Date | null;
  transacoes: TransacaoOfx[];
};

/** Extrato bancário brasileiro comum vem em ISO-8859-1/CP1252, não UTF-8 — sem isso, acento em MEMO vira lixo. */
export function decodificarOfx(bytes: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("iso-8859-1").decode(bytes);
  }
}

function extrairTag(bloco: string, tag: string): string | null {
  const m = bloco.match(new RegExp(`<${tag}>([^\\r\\n<]*)`, "i"));
  return m ? m[1].trim() : null;
}

/** "AAAAMMDDHHmmss[.xxx][+-TZ]" ou só "AAAAMMDD" — meio-dia fixo evita a data virar o dia anterior por causa de fuso. */
function parseDataOfx(valor: string): Date | null {
  const digitos = valor.replace(/[^0-9]/g, "").slice(0, 8);
  if (digitos.length < 8) return null;
  const ano = digitos.slice(0, 4);
  const mes = digitos.slice(4, 6);
  const dia = digitos.slice(6, 8);
  const data = new Date(`${ano}-${mes}-${dia}T12:00:00-03:00`);
  return isNaN(data.getTime()) ? null : data;
}

export function parseOfx(conteudo: string): ExtratoOfx {
  const blocosTransacao = conteudo.match(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi) ?? [];

  const transacoes: TransacaoOfx[] = [];
  for (const bloco of blocosTransacao) {
    const dtPosted = extrairTag(bloco, "DTPOSTED");
    const trnAmt = extrairTag(bloco, "TRNAMT");
    if (!dtPosted || !trnAmt) continue;

    const data = parseDataOfx(dtPosted);
    const valor = parseFloat(trnAmt.replace(",", "."));
    if (!data || isNaN(valor)) continue;

    const descricao = extrairTag(bloco, "MEMO") || extrairTag(bloco, "NAME") || "(sem descrição)";
    transacoes.push({
      data,
      descricao,
      valorCentavos: Math.round(Math.abs(valor) * 100),
      tipo: valor < 0 ? "SAIDA" : "ENTRADA",
      fitId: extrairTag(bloco, "FITID"),
    });
  }

  const dtStart = conteudo.match(/<DTSTART>([^\r\n<]*)/i);
  const dtEnd = conteudo.match(/<DTEND>([^\r\n<]*)/i);

  return {
    periodoInicio: dtStart ? parseDataOfx(dtStart[1]) : null,
    periodoFim: dtEnd ? parseDataOfx(dtEnd[1]) : null,
    transacoes,
  };
}

import "server-only";
import { EMPRESA } from "@/lib/constants/empresa";
import { centavosParaReais } from "@/lib/utils/money";
import { calcularTotalCentavos } from "@/lib/server/orcamentos";

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho",
  ENVIADO: "Enviado",
  APROVADO: "Aprovado",
  RECUSADO: "Recusado",
  EXPIRADO: "Expirado",
};

export type ItemEmailOrcamento = {
  nome: string;
  quantidade: number;
  valorUnitarioCentavos: number;
  imagemUrl: string | null;
};

/** Monta o HTML do e-mail de envio de orçamento — tabelas + estilo inline, pra renderizar bem em clientes de e-mail. */
export function gerarHtmlEmailOrcamento(input: {
  numero: number;
  status: string;
  validadeDias: number;
  createdAt: Date;
  observacoes: string | null;
  descontoCentavos: number;
  clienteNome: string;
  itens: ItemEmailOrcamento[];
  link: string;
}): string {
  const total = calcularTotalCentavos(input.itens, input.descontoCentavos);
  const validade = new Date(input.createdAt);
  validade.setDate(validade.getDate() + input.validadeDias);
  const formatarData = (d: Date) => new Intl.DateTimeFormat("pt-BR").format(d);

  const linhasItens = input.itens
    .map(
      (item) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;">
            <table cellpadding="0" cellspacing="0"><tr>
              ${
                item.imagemUrl
                  ? `<td style="width:36px;padding-right:8px;"><img src="${item.imagemUrl}" width="36" height="36" style="object-fit:contain;border-radius:4px;background:#f5f5f5;" alt="" /></td>`
                  : ""
              }
              <td style="font-size:14px;color:#171717;">${escaparHtml(item.nome)}</td>
            </tr></table>
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-size:14px;color:#171717;">${item.quantidade}</td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-size:14px;color:#171717;">${centavosParaReais(item.valorUnitarioCentavos)}</td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-size:14px;font-weight:600;color:#171717;">${centavosParaReais(item.quantidade * item.valorUnitarioCentavos)}</td>
        </tr>`,
    )
    .join("");

  return `
<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:24px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
    <table cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="background:#00A99D;padding:20px 24px;">
          <span style="color:#ffffff;font-size:18px;font-weight:700;">Legaus Kids</span>
        </td>
      </tr>
      <tr>
        <td style="padding:24px;">
          <h1 style="margin:0 0 4px;font-size:20px;color:#171717;">Orçamento nº ${String(input.numero).padStart(4, "0")}</h1>
          <p style="margin:0 0 16px;font-size:13px;color:#737373;">
            Emitido em ${formatarData(input.createdAt)} · Válido até ${formatarData(validade)} · ${STATUS_LABEL[input.status] ?? input.status}
          </p>
          <p style="font-size:14px;color:#404040;">Olá, ${escaparHtml(input.clienteNome)}! Segue o orçamento solicitado à Legaus Kids.</p>

          <table cellpadding="0" cellspacing="0" width="100%" style="margin-top:16px;border-collapse:collapse;">
            <thead>
              <tr>
                <th align="left" style="font-size:11px;text-transform:uppercase;color:#737373;border-bottom:1px solid #ddd;padding-bottom:6px;">Item</th>
                <th align="right" style="font-size:11px;text-transform:uppercase;color:#737373;border-bottom:1px solid #ddd;padding-bottom:6px;">Qtd.</th>
                <th align="right" style="font-size:11px;text-transform:uppercase;color:#737373;border-bottom:1px solid #ddd;padding-bottom:6px;">Unit.</th>
                <th align="right" style="font-size:11px;text-transform:uppercase;color:#737373;border-bottom:1px solid #ddd;padding-bottom:6px;">Subtotal</th>
              </tr>
            </thead>
            <tbody>${linhasItens}</tbody>
          </table>

          <table cellpadding="0" cellspacing="0" width="100%" style="margin-top:12px;">
            <tr>
              <td></td>
              <td align="right" style="font-size:18px;font-weight:700;color:#00655c;padding-top:8px;">Total: ${centavosParaReais(total)}</td>
            </tr>
          </table>

          ${
            input.observacoes
              ? `<p style="margin-top:16px;font-size:13px;color:#525252;white-space:pre-wrap;">${escaparHtml(input.observacoes)}</p>`
              : ""
          }

          <div style="text-align:center;margin-top:24px;">
            <a href="${input.link}" style="display:inline-block;background:#00A99D;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:6px;">
              Ver orçamento completo
            </a>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 24px;background:#fafafa;text-align:center;font-size:12px;color:#a3a3a3;">
          ${EMPRESA.nomeFantasia} · ${EMPRESA.telefone} · ${EMPRESA.site}
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function gerarTextoAlternativoEmailOrcamento(numero: number, link: string): string {
  return `Segue o orçamento nº ${String(numero).padStart(4, "0")} da Legaus Kids. Acesse: ${link}`;
}

function escaparHtml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

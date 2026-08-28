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

export type OrcamentoDocumentoVM = {
  numero: number;
  status: string;
  createdAt: Date;
  validadeDias: number;
  observacoes: string | null;
  descontoCentavos: number;
  contato: { nome: string; razaoSocial: string | null; cnpj: string | null; telefone: string | null; endereco: string | null; cidade: string | null; uf: string | null } | null;
  responsavel: { nome: string };
  itens: { nome: string; quantidade: number; valorUnitarioCentavos: number; imagemUrl: string | null }[];
};

function formatarData(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR").format(data);
}

export function OrcamentoDocumento({ orcamento }: { orcamento: OrcamentoDocumentoVM }) {
  const subtotal = orcamento.itens.reduce((soma, item) => soma + item.quantidade * item.valorUnitarioCentavos, 0);
  const total = calcularTotalCentavos(orcamento.itens, orcamento.descontoCentavos);
  const validade = new Date(orcamento.createdAt);
  validade.setDate(validade.getDate() + orcamento.validadeDias);

  return (
    <div id="orcamento-documento" className="mx-auto max-w-3xl bg-white p-8 text-neutral-900 print:p-0">
      <div className="flex items-start justify-between border-b-2 border-[#00A99D] pb-4">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/legaus-logo.png" alt="Legaus Kids" className="h-16 w-auto" />
        </div>
        <div className="text-right text-xs text-neutral-600">
          <p className="font-semibold text-neutral-900">{EMPRESA.razaoSocial}</p>
          <p>CNPJ {EMPRESA.cnpj}</p>
          <p>
            {EMPRESA.endereco}, {EMPRESA.bairro} — {EMPRESA.cidade}/{EMPRESA.uf}
          </p>
          <p>CEP {EMPRESA.cep}</p>
          <p>
            {EMPRESA.telefone} · {EMPRESA.email}
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Orçamento nº {String(orcamento.numero).padStart(4, "0")}</h1>
          <p className="text-sm text-neutral-500">
            Emitido em {formatarData(orcamento.createdAt)} · Válido até {formatarData(validade)}
          </p>
        </div>
        <span className="rounded-full bg-[#d9f2ef] px-3 py-1 text-xs font-semibold text-[#00655c]">
          {STATUS_LABEL[orcamento.status] ?? orcamento.status}
        </span>
      </div>

      {orcamento.contato && (
        <div className="mt-4 rounded-lg bg-neutral-50 p-3 text-sm">
          <p className="font-semibold text-neutral-900">{orcamento.contato.nome}</p>
          {orcamento.contato.razaoSocial && <p className="text-neutral-600">{orcamento.contato.razaoSocial}</p>}
          {orcamento.contato.cnpj && <p className="text-neutral-600">CNPJ {orcamento.contato.cnpj}</p>}
          {orcamento.contato.telefone && <p className="text-neutral-600">{orcamento.contato.telefone}</p>}
          {orcamento.contato.endereco && (
            <p className="text-neutral-600">
              {orcamento.contato.endereco}
              {orcamento.contato.cidade ? ` — ${orcamento.contato.cidade}/${orcamento.contato.uf}` : ""}
            </p>
          )}
        </div>
      )}

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-300 text-left text-xs uppercase tracking-wide text-neutral-500">
            <th className="py-2">Item</th>
            <th className="py-2 text-right">Qtd.</th>
            <th className="py-2 text-right">Valor unit.</th>
            <th className="py-2 text-right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {orcamento.itens.map((item, i) => (
            <tr key={i} className="border-b border-neutral-100">
              <td className="py-2">
                <div className="flex items-center gap-2">
                  <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded bg-neutral-100">
                    {item.imagemUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imagemUrl} alt="" className="h-full w-full object-contain" />
                    ) : null}
                  </div>
                  <span>{item.nome}</span>
                </div>
              </td>
              <td className="py-2 text-right tabular-nums">{item.quantidade}</td>
              <td className="py-2 text-right tabular-nums">{centavosParaReais(item.valorUnitarioCentavos)}</td>
              <td className="py-2 text-right tabular-nums">{centavosParaReais(item.quantidade * item.valorUnitarioCentavos)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <div className="w-56 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-neutral-500">Subtotal</span>
            <span className="tabular-nums">{centavosParaReais(subtotal)}</span>
          </div>
          {orcamento.descontoCentavos > 0 && (
            <div className="flex justify-between">
              <span className="text-neutral-500">Desconto</span>
              <span className="tabular-nums">-{centavosParaReais(orcamento.descontoCentavos)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-neutral-300 pt-1 text-base font-bold">
            <span>Total</span>
            <span className="tabular-nums">{centavosParaReais(total)}</span>
          </div>
        </div>
      </div>

      {orcamento.observacoes && (
        <div className="mt-6 border-t border-neutral-200 pt-4 text-sm">
          <p className="mb-1 font-semibold text-neutral-700">Observações</p>
          <p className="whitespace-pre-wrap text-neutral-600">{orcamento.observacoes}</p>
        </div>
      )}

      <div className="mt-8 border-t border-neutral-200 pt-3 text-xs text-neutral-400">
        <p>Responsável: {orcamento.responsavel.nome} · {EMPRESA.nomeFantasia} — {EMPRESA.site}</p>
      </div>
    </div>
  );
}

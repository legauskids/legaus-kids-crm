// Cálculos da guia "Lista de preços" (Cadastros → Produtos). Puro — sem
// acesso a banco — pra poder rodar tanto no servidor (ao salvar) quanto no
// cliente (preview instantâneo enquanto digita).

export type EntradaPrecificacao = {
  custoCompraCentavos: number | null;
  freteCustoCentavos: number | null;
  ipiCustoCentavos: number | null;
  outrosCustoCentavos: number | null;
  quantidadeReferencia: number;
  markupPercentual: number | null;
  impostoPercentual: number | null;
  instalacaoCentavos: number | null;
};

export type ResultadoPrecificacao = {
  custoTotalUnitCentavos: number;
  totalCompraCentavos: number;
  precoVendaCentavos: number;
  resultadoCentavos: number;
  percentualLucro: number;
};

export function calcularPrecificacao(entrada: EntradaPrecificacao): ResultadoPrecificacao {
  const compra = entrada.custoCompraCentavos ?? 0;
  const frete = entrada.freteCustoCentavos ?? 0;
  const ipi = entrada.ipiCustoCentavos ?? 0;
  const outros = entrada.outrosCustoCentavos ?? 0;
  const quantidade = Math.max(1, entrada.quantidadeReferencia || 1);
  const markup = entrada.markupPercentual ?? 0;

  const custoTotalUnitCentavos = compra + frete + ipi + outros;
  const totalCompraCentavos = custoTotalUnitCentavos * quantidade;
  const precoVendaCentavos = Math.round(custoTotalUnitCentavos * (1 + markup / 100));
  // Resultado e % de lucro: preço de venda menos custo total (unitário),
  // margem = resultado / preço de venda.
  const resultadoCentavos = precoVendaCentavos - custoTotalUnitCentavos;
  const percentualLucro = precoVendaCentavos > 0 ? (resultadoCentavos / precoVendaCentavos) * 100 : 0;

  return {
    custoTotalUnitCentavos,
    totalCompraCentavos,
    precoVendaCentavos,
    resultadoCentavos,
    percentualLucro,
  };
}

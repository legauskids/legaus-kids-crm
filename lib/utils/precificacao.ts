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
  receitaTotalCentavos: number;
  impostoValorCentavos: number;
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
  const imposto = entrada.impostoPercentual ?? 0;
  const instalacao = entrada.instalacaoCentavos ?? 0;

  const custoTotalUnitCentavos = compra + frete + ipi + outros;
  const totalCompraCentavos = custoTotalUnitCentavos * quantidade;
  const precoVendaCentavos = Math.round(custoTotalUnitCentavos * (1 + markup / 100));
  const receitaTotalCentavos = precoVendaCentavos * quantidade;
  const impostoValorCentavos = Math.round(receitaTotalCentavos * (imposto / 100));
  const resultadoCentavos = receitaTotalCentavos - totalCompraCentavos - impostoValorCentavos - instalacao;
  const percentualLucro = receitaTotalCentavos > 0 ? (resultadoCentavos / receitaTotalCentavos) * 100 : 0;

  return {
    custoTotalUnitCentavos,
    totalCompraCentavos,
    precoVendaCentavos,
    receitaTotalCentavos,
    impostoValorCentavos,
    resultadoCentavos,
    percentualLucro,
  };
}

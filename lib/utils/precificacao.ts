// Cálculos da guia "Lista de preços" (Cadastros → Produtos). Puro — sem
// acesso a banco — pra poder rodar tanto no servidor (ao salvar) quanto no
// cliente (preview instantâneo enquanto digita).

export type EntradaPrecificacao = {
  custoCompraCentavos: number | null;
  freteCustoCentavos: number | null;
  ipiPercentual: number | null;
  outrosPercentual: number | null;
  quantidadeReferencia: number;
  markupPercentual: number | null;
  impostoPercentual: number | null;
  instalacaoCentavos: number | null;
};

export type ResultadoPrecificacao = {
  custoTotalUnitCentavos: number;
  totalCompraCentavos: number;
  precoVendaCentavos: number;
  ipiValorCentavos: number;
  outrosValorCentavos: number;
  impostoValorCentavos: number;
  resultadoCentavos: number;
  percentualLucro: number;
};

export function calcularPrecificacao(entrada: EntradaPrecificacao): ResultadoPrecificacao {
  const compra = entrada.custoCompraCentavos ?? 0;
  const frete = entrada.freteCustoCentavos ?? 0;
  const ipiPercentual = entrada.ipiPercentual ?? 0;
  const outrosPercentual = entrada.outrosPercentual ?? 0;
  const quantidade = Math.max(1, entrada.quantidadeReferencia || 1);
  const markup = entrada.markupPercentual ?? 0;
  const imposto = entrada.impostoPercentual ?? 0;
  const instalacao = entrada.instalacaoCentavos ?? 0;

  // IPI e Outros: percentual sobre o custo de compra (mesma lógica de
  // Imposto ser percentual sobre o preço de venda) — só o % é editado, o
  // valor em R$ é sempre calculado a partir dele.
  const ipiValorCentavos = Math.round(compra * (ipiPercentual / 100));
  const outrosValorCentavos = Math.round(compra * (outrosPercentual / 100));

  const custoTotalUnitCentavos = compra + frete + ipiValorCentavos + outrosValorCentavos;
  const totalCompraCentavos = custoTotalUnitCentavos * quantidade;
  // Preço de venda = total da compra + markup sobre o total da compra.
  const precoVendaCentavos = Math.round(totalCompraCentavos * (1 + markup / 100));
  // Imposto: só o percentual é editado; o valor em R$ é sempre calculado.
  const impostoValorCentavos = Math.round(precoVendaCentavos * (imposto / 100));
  // Resultado = preço de venda menos total da compra, imposto e instalação.
  const resultadoCentavos = precoVendaCentavos - totalCompraCentavos - impostoValorCentavos - instalacao;
  const percentualLucro = precoVendaCentavos > 0 ? (resultadoCentavos / precoVendaCentavos) * 100 : 0;

  return {
    custoTotalUnitCentavos,
    totalCompraCentavos,
    precoVendaCentavos,
    ipiValorCentavos,
    outrosValorCentavos,
    impostoValorCentavos,
    resultadoCentavos,
    percentualLucro,
  };
}

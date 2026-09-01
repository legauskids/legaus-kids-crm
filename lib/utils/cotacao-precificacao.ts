// Cálculo da guia "Cotações" (Cadastros → Cotações) — reconstrução das
// planilhas de custo/margem que o Marcos já usa (Playground, Kidplay...).
// Puro — sem acesso a banco — pra poder rodar tanto no servidor quanto no
// cliente (preview instantâneo enquanto edita).

export type MaoDeObraItem = { label: string; valorCentavos: number };

export type EntradaCotacao = {
  itens: { quantidade: number; custoUnitarioCentavos: number }[];
  maoDeObra: MaoDeObraItem[];
  markup: number;
  adicionalCentavos: number;
  instalacaoPercentual: number;
  freteKm: number;
  fretePrecoPorKmCentavos: number;
  impostoCentavos: number;
};

export type ResultadoCotacao = {
  totalMateriaisCentavos: number;
  totalMaoDeObraCentavos: number;
  precoVendaCalculadoCentavos: number;
  precoDeVendaTotalCentavos: number;
  valorInstalacaoCentavos: number;
  precoVendaComInstalacaoCentavos: number;
  valorFreteCentavos: number;
  totalCentavos: number;
  totalDeCustosCentavos: number;
  resultadoCentavos: number;
  percentualLucro: number;
};

export function calcularCotacao(entrada: EntradaCotacao): ResultadoCotacao {
  const totalMateriaisCentavos = entrada.itens.reduce(
    (soma, item) => soma + Math.round(item.quantidade * item.custoUnitarioCentavos),
    0,
  );
  const totalMaoDeObraCentavos = entrada.maoDeObra.reduce((soma, m) => soma + m.valorCentavos, 0);

  // Preço de venda = (custo de material + mão de obra) x markup (multiplicador, ex: 1,90).
  const precoVendaCalculadoCentavos = Math.round((totalMateriaisCentavos + totalMaoDeObraCentavos) * entrada.markup);
  const precoDeVendaTotalCentavos = precoVendaCalculadoCentavos + entrada.adicionalCentavos;
  const valorInstalacaoCentavos = Math.round(precoDeVendaTotalCentavos * (entrada.instalacaoPercentual / 100));
  const precoVendaComInstalacaoCentavos = precoDeVendaTotalCentavos + valorInstalacaoCentavos;
  const valorFreteCentavos = Math.round(entrada.freteKm * entrada.fretePrecoPorKmCentavos);
  // total = valor final cobrado do cliente.
  const totalCentavos = precoVendaComInstalacaoCentavos + valorFreteCentavos;
  // custos reais (material + mão de obra + imposto + frete) — comparado
  // contra o total cobrado pra achar o resultado/margem real.
  const totalDeCustosCentavos = totalMateriaisCentavos + totalMaoDeObraCentavos + entrada.impostoCentavos + valorFreteCentavos;
  const resultadoCentavos = totalCentavos - totalDeCustosCentavos;
  const percentualLucro = totalCentavos > 0 ? (resultadoCentavos / totalCentavos) * 100 : 0;

  return {
    totalMateriaisCentavos,
    totalMaoDeObraCentavos,
    precoVendaCalculadoCentavos,
    precoDeVendaTotalCentavos,
    valorInstalacaoCentavos,
    precoVendaComInstalacaoCentavos,
    valorFreteCentavos,
    totalCentavos,
    totalDeCustosCentavos,
    resultadoCentavos,
    percentualLucro,
  };
}

// Modo "por item" (tipo OUTROS) — projetos maiores com itens variados, onde
// cada linha tem seu próprio markup/frete/instalação/imposto, em vez de um
// resumo único pro projeto inteiro (Playground/Kidplay usam calcularCotacao
// acima). Reconstrução exata da planilha "Outros-Cotação" do Marcos.

export type EntradaItemPorItem = {
  quantidade: number;
  custoUnitarioCentavos: number;
  antecipacaoIcmsCentavos: number;
  freteCentavos: number;
  instalacaoCentavos: number;
  markup: number;
  impostoPercentual: number;
};

export type ResultadoItemPorItem = {
  totalCentavos: number;
  vendaCentavos: number;
  impostoCentavos: number;
  custoFinalCentavos: number;
  lucroCentavos: number;
  percentualLucro: number;
};

export function calcularItemPorItem(entrada: EntradaItemPorItem): ResultadoItemPorItem {
  const totalCentavos = Math.round(entrada.quantidade * entrada.custoUnitarioCentavos);
  // base = total do item + custos extras da linha, ANTES do markup.
  const baseCentavos = totalCentavos + entrada.antecipacaoIcmsCentavos + entrada.freteCentavos + entrada.instalacaoCentavos;
  const vendaCentavos = Math.round(baseCentavos * entrada.markup);
  const impostoCentavos = Math.round(vendaCentavos * (entrada.impostoPercentual / 100));
  const custoFinalCentavos = baseCentavos + impostoCentavos;
  const lucroCentavos = vendaCentavos - custoFinalCentavos;
  const percentualLucro = vendaCentavos > 0 ? (lucroCentavos / vendaCentavos) * 100 : 0;

  return { totalCentavos, vendaCentavos, impostoCentavos, custoFinalCentavos, lucroCentavos, percentualLucro };
}

// Cálculo do resultado financeiro (regime de CAIXA: o que de fato entrou e
// saiu no extrato) a partir dos lançamentos e do rateio deles entre projetos
// e centros de custo. Função pura — sem banco — pra dar pra testar e reusar
// no dashboard financeiro e no painel de reunião. Lançamento IGNORADO (ex.:
// transferência entre contas da própria empresa) não conta.

export type RateioParaResultado = {
  valorCentavos: number;
  negocioId: string | null;
  negocioTitulo: string | null;
  contatoNome: string | null;
  centroCustoId: string | null;
  centroCustoNome: string | null;
};

export type TransacaoParaResultado = {
  data: Date;
  valorCentavos: number;
  tipo: "ENTRADA" | "SAIDA";
  status: "NAO_CONCILIADA" | "CONCILIADA" | "IGNORADA";
  rateios: RateioParaResultado[];
};

export type LinhaCentro = { id: string; nome: string; valorCentavos: number; percentual: number };
export type LinhaProjeto = {
  negocioId: string;
  titulo: string;
  contatoNome: string | null;
  recebidoCentavos: number;
  custosCentavos: number;
  margemCentavos: number;
  margemPercentual: number | null;
};

export type ResultadoPeriodo = {
  entradasCentavos: number;
  saidasCentavos: number;
  resultadoCentavos: number;
  margemPercentual: number | null;
  aClassificar: { entradasCentavos: number; saidasCentavos: number; lancamentos: number };
  dre: {
    receitaProjetosCentavos: number;
    outrasReceitasCentavos: number;
    receitasAClassificarCentavos: number;
    custosProjetosCentavos: number;
    margemContribuicaoCentavos: number;
    despesasCentrosCentavos: number;
    despesasAClassificarCentavos: number;
  };
  receitasPorCentro: LinhaCentro[];
  despesasPorCentro: LinhaCentro[];
  projetos: LinhaProjeto[];
};

function percentual(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 1000) / 10 : 0;
}

function agruparCentros(mapa: Map<string, { nome: string; valor: number }>, total: number): LinhaCentro[] {
  return [...mapa.entries()]
    .map(([id, c]) => ({ id, nome: c.nome, valorCentavos: c.valor, percentual: percentual(c.valor, total) }))
    .sort((a, b) => b.valorCentavos - a.valorCentavos);
}

export function calcularResultado(transacoes: TransacaoParaResultado[]): ResultadoPeriodo {
  let entradas = 0;
  let saidas = 0;
  let entradasAClassificar = 0;
  let saidasAClassificar = 0;
  let lancamentosAClassificar = 0;
  let receitaProjetos = 0;
  let outrasReceitas = 0;
  let custosProjetos = 0;
  let despesasCentros = 0;
  const receitasCentro = new Map<string, { nome: string; valor: number }>();
  const despesasCentro = new Map<string, { nome: string; valor: number }>();
  const projetos = new Map<string, { titulo: string; contatoNome: string | null; recebido: number; custos: number }>();

  for (const t of transacoes) {
    if (t.status === "IGNORADA") continue;
    const entrada = t.tipo === "ENTRADA";
    if (entrada) entradas += t.valorCentavos;
    else saidas += t.valorCentavos;

    let classificado = 0;
    for (const r of t.rateios) {
      classificado += r.valorCentavos;
      if (r.negocioId) {
        const p = projetos.get(r.negocioId) ?? { titulo: r.negocioTitulo ?? "Projeto", contatoNome: r.contatoNome, recebido: 0, custos: 0 };
        if (entrada) {
          p.recebido += r.valorCentavos;
          receitaProjetos += r.valorCentavos;
        } else {
          p.custos += r.valorCentavos;
          custosProjetos += r.valorCentavos;
        }
        projetos.set(r.negocioId, p);
      } else if (r.centroCustoId) {
        const mapa = entrada ? receitasCentro : despesasCentro;
        const c = mapa.get(r.centroCustoId) ?? { nome: r.centroCustoNome ?? "Centro de custo", valor: 0 };
        c.valor += r.valorCentavos;
        mapa.set(r.centroCustoId, c);
        if (entrada) outrasReceitas += r.valorCentavos;
        else despesasCentros += r.valorCentavos;
      }
    }
    const falta = Math.max(t.valorCentavos - classificado, 0);
    if (falta > 0) {
      lancamentosAClassificar++;
      if (entrada) entradasAClassificar += falta;
      else saidasAClassificar += falta;
    }
  }

  const resultado = entradas - saidas;
  return {
    entradasCentavos: entradas,
    saidasCentavos: saidas,
    resultadoCentavos: resultado,
    margemPercentual: entradas > 0 ? percentual(resultado, entradas) : null,
    aClassificar: { entradasCentavos: entradasAClassificar, saidasCentavos: saidasAClassificar, lancamentos: lancamentosAClassificar },
    dre: {
      receitaProjetosCentavos: receitaProjetos,
      outrasReceitasCentavos: outrasReceitas,
      receitasAClassificarCentavos: entradasAClassificar,
      custosProjetosCentavos: custosProjetos,
      margemContribuicaoCentavos: receitaProjetos - custosProjetos,
      despesasCentrosCentavos: despesasCentros,
      despesasAClassificarCentavos: saidasAClassificar,
    },
    receitasPorCentro: agruparCentros(receitasCentro, entradas),
    despesasPorCentro: agruparCentros(despesasCentro, saidas),
    projetos: [...projetos.entries()]
      .map(([negocioId, p]) => ({
        negocioId,
        titulo: p.titulo,
        contatoNome: p.contatoNome,
        recebidoCentavos: p.recebido,
        custosCentavos: p.custos,
        margemCentavos: p.recebido - p.custos,
        margemPercentual: p.recebido > 0 ? percentual(p.recebido - p.custos, p.recebido) : null,
      }))
      .sort((a, b) => b.recebidoCentavos + b.custosCentavos - (a.recebidoCentavos + a.custosCentavos)),
  };
}

/** "AAAA-MM" do lançamento no horário de Brasília. */
export function mesDoLancamento(data: Date): string {
  return data.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
}

/** Entradas, saídas e resultado por mês, na ordem dos meses pedidos (meses sem lançamento = zero). */
export function serieMensal(transacoes: TransacaoParaResultado[], meses: string[]) {
  const porMes = new Map(meses.map((m) => [m, { entradas: 0, saidas: 0 }]));
  for (const t of transacoes) {
    if (t.status === "IGNORADA") continue;
    const alvo = porMes.get(mesDoLancamento(t.data));
    if (!alvo) continue;
    if (t.tipo === "ENTRADA") alvo.entradas += t.valorCentavos;
    else alvo.saidas += t.valorCentavos;
  }
  return meses.map((mes) => {
    const v = porMes.get(mes)!;
    return { mes, entradasCentavos: v.entradas, saidasCentavos: v.saidas, resultadoCentavos: v.entradas - v.saidas };
  });
}

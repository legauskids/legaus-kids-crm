import { describe, expect, it } from "vitest";
import {
  OPCAO_CONFIRMAR,
  OPCAO_DESCARTAR,
  OPCAO_NEGOCIO,
  enqueteDaDespesa,
  fornecedorNaMensagem,
  interpretarRespostaRascunho,
  mensagemDeConfirmacao,
  montarDespesaDaMensagem,
  negociosParecidos,
  pareceMesmaDespesa,
  pareceRespostaDeDespesa,
  resolverCategoria,
  resolverCentro,
  resolverDataFalada,
  trechoDeclarado,
  valoresDoTexto,
  type ExtracaoDespesa,
} from "./despesa-agente";

const CATEGORIAS = [
  { id: "materia", nome: "Matéria-prima e insumos", centroGeralPadraoId: "cg-producao" },
  { id: "veiculos", nome: "Veículos e combustível", centroGeralPadraoId: "cg-veiculos", palavrasChave: ["POSTO", "COMBUSTIVEL", "PEDAGIO"] },
  { id: "tarifas", nome: "Tarifas bancárias e juros", centroGeralPadraoId: "cg-administrativo" },
  { id: "alimentacao", nome: "Alimentação", centroGeralPadraoId: "cg-administrativo" },
  { id: "hospedagem", nome: "Hospedagem e viagens", centroGeralPadraoId: "cg-instalacao" },
  { id: "outras", nome: "Outras despesas", centroGeralPadraoId: "cg-administrativo" },
];
const CENTROS = [
  { id: "cg-veiculos", nome: "Veículos" },
  { id: "cg-producao", nome: "Produção" },
  { id: "cg-instalacao", nome: "Instalação" },
  { id: "cg-administrativo", nome: "Administrativo" },
  { id: "cg-marketing", nome: "Marketing" },
];
const NEGOCIOS = [
  { id: "neg-arco", titulo: "Playground Escola Arco-Íris", contatoNome: "Escola Arco-Íris" },
  { id: "neg-serra", titulo: "Kidplay Restaurante Sabor da Serra", contatoNome: null },
  { id: "neg-bela", titulo: "Espaço kids Condomínio Bela Vista", contatoNome: "Condomínio Bela Vista" },
];
const HOJE = "2026-10-07"; // quarta-feira

function montar(texto: string, extracao: ExtracaoDespesa, origem: "TEXTO" | "AUDIO" | "COMPROVANTE" = "AUDIO") {
  return montarDespesaDaMensagem({ texto, origem, hoje: HOJE, extracao, categorias: CATEGORIAS, centrosGerais: CENTROS, negocios: NEGOCIOS });
}

// As 3 frases do pedido, com a extração que o modelo devolve pra cada uma.
describe("frases de exemplo", () => {
  it("1. posto Ipiranga: categoria e centro deduzidos -> pede confirmação", () => {
    const r = montar("Acabei de abastecer o veículo da Legaus Kids, 250 reais de combustível no posto Ipiranga", {
      valor: 250,
      fornecedor: "Posto Ipiranga",
      dataTexto: "acabei de",
      categoria: "Veículos e combustível",
      centro: "Veículos",
    });
    expect(r.registrarDireto).toBe(false);
    expect(r.motivos).toEqual(["categoria deduzida", "centro deduzido"]);
    expect(r.dados).toMatchObject({ dia: HOJE, valorCentavos: 25000, fornecedor: "Posto Ipiranga", categoriaId: "veiculos", centroGeralId: "cg-veiculos", negocioId: null });
    expect(r.valorNaMensagem && r.fornecedorNaMensagem).toBe(true);
  });

  it("2. madeireira pra obra do Arco-Íris: categoria deduzida, centro = negócio -> pede confirmação", () => {
    const r = montar("Paguei R$ 480 na madeireira Pinheiro, é pra obra do Arco-Íris", {
      valor: 480,
      fornecedor: "Madeireira Pinheiro",
      categoria: "Matéria-prima e insumos",
      centro: "obra do Arco-Íris",
    });
    expect(r.registrarDireto).toBe(false);
    expect(r.motivos).toContain("categoria deduzida");
    expect(r.dados).toMatchObject({ valorCentavos: 48000, categoriaId: "materia", negocioId: "neg-arco", centroGeralId: null });
    expect(r.nomes).toMatchObject({ centro: "Playground Escola Arco-Íris", centroEhProjeto: true });
  });

  it("3. almoço com categoria e centro ditos -> registra direto", () => {
    const r = montar("Almoço da equipe de instalação, 96 reais no restaurante Sabor Gaúcho, categoria alimentação, centro de custo instalação", {
      valor: 96,
      fornecedor: "Restaurante Sabor Gaúcho",
      categoria: "Alimentação",
      centro: "Instalação",
    });
    expect(r.motivos).toEqual([]);
    expect(r.registrarDireto).toBe(true);
    expect(r.dados).toMatchObject({ valorCentavos: 9600, categoriaId: "alimentacao", centroGeralId: "cg-instalacao" });
  });
});

describe("regra de confirmação", () => {
  const frase3 = "Almoço da equipe, 96 reais no restaurante Sabor Gaúcho, categoria alimentação, centro de custo instalação";
  const extracao3 = { valor: 96, fornecedor: "Restaurante Sabor Gaúcho", categoria: "Alimentação", centro: "Instalação" };

  it("comprovante sempre pede confirmação, mesmo com tudo dito", () => {
    const r = montar(frase3, extracao3, "COMPROVANTE");
    expect(r.registrarDireto).toBe(false);
    expect(r.motivos).toEqual(["comprovante sempre pede confirmação"]);
  });

  it("valor que não está escrito na mensagem pede confirmação", () => {
    expect(montar(frase3, { ...extracao3, valor: 69 }).motivos).toContain("valor não está escrito na mensagem");
  });

  it("fornecedor que não aparece na mensagem pede confirmação", () => {
    expect(montar(frase3, { ...extracao3, fornecedor: "Churrascaria Gaúcha" }).motivos).toContain("fornecedor incerto");
  });

  it("modelo trocando a categoria dita não passa como declarada", () => {
    const r = montar(frase3, { ...extracao3, categoria: "Outras despesas" });
    expect(r.dados.categoriaId).toBe("alimentacao");
    expect(r.registrarDireto).toBe(true);
  });

  it("faltando dado pede confirmação e diz o que faltou", () => {
    const r = montar("gastei 50 reais", { valor: 50 });
    expect(r.registrarDireto).toBe(false);
    expect(r.faltando).toEqual(["fornecedor", "categoria", "centro de custo"]);
    expect(mensagemDeConfirmacao(r, HOJE)).toContain("Não consegui identificar: fornecedor, categoria, centro de custo.");
  });

  it("modelo sem categoria: usa as palavras-chave das categorias (deduzida)", () => {
    const r = montar("gastei 50 no pedágio da free way", { valor: 50, fornecedor: "Free Way" });
    expect(r.dados).toMatchObject({ categoriaId: "veiculos", centroGeralId: "cg-veiculos" });
    expect(r.motivos).toContain("categoria deduzida");
  });

  it("sem centro dito, usa o centro sugerido da categoria (como deduzido)", () => {
    const r = montar("paguei 39,90 de tarifa no Sicredi", { valor: 39.9, fornecedor: "Sicredi", categoria: "tarifas" });
    expect(r.dados).toMatchObject({ valorCentavos: 3990, categoriaId: "tarifas", centroGeralId: "cg-administrativo" });
    expect(r.registrarDireto).toBe(false);
  });

  it("a mensagem de confirmação marca o deduzido, pergunta do negócio e aponta pra enquete", () => {
    const r = montar("Acabei de abastecer, 250 reais no posto Ipiranga", { valor: 250, fornecedor: "Posto Ipiranga", categoria: "combustível" });
    const msg = mensagemDeConfirmacao(r, HOJE);
    expect(msg).toContain("*R$ 250,00* — Posto Ipiranga");
    expect(msg).toContain("📅 07/10 (hoje)");
    expect(msg).toContain("Veículos e combustível _(deduzida)_");
    expect(msg).toContain("🏗️ É de algum negócio/obra?");
    expect(msg.endsWith("Confirme na enquete abaixo ou responda *sim* (texto ou áudio). Se algo estiver errado, me diga o que corrigir.")).toBe(true);
    expect(msg).not.toContain("*1*");
    expect(mensagemDeConfirmacao(r, HOJE, undefined, "crm").endsWith("Responda *sim* para confirmar ou me diga o que corrigir.")).toBe(true);
  });

  it("centro já é negócio: não pergunta de novo e a enquete não tem a opção de negócio", () => {
    const r = montar("Paguei R$ 480 na madeireira Pinheiro, é pra obra do Arco-Íris", { valor: 480, fornecedor: "Madeireira Pinheiro", centro: "Arco-Íris" });
    expect(mensagemDeConfirmacao(r, HOJE)).not.toContain("É de algum negócio");
    expect(enqueteDaDespesa({ id: "d1", valorCentavos: 48000, fornecedor: "Madeireira Pinheiro", ehProjeto: true })).toEqual({
      pergunta: "Confirmar a despesa de R$ 480,00 — Madeireira Pinheiro?",
      opcoes: [OPCAO_CONFIRMAR, OPCAO_DESCARTAR],
      ref: "despesa:d1",
    });
    expect(enqueteDaDespesa({ id: "d2", valorCentavos: 4596, fornecedor: "UFFA", ehProjeto: false }).opcoes).toEqual([OPCAO_CONFIRMAR, OPCAO_NEGOCIO, OPCAO_DESCARTAR]);
  });
});

describe("resolverDataFalada", () => {
  it.each([
    ["hoje", "2026-10-07"],
    ["ontem", "2026-10-06"],
    ["anteontem", "2026-10-05"],
    ["antes de ontem", "2026-10-05"],
    ["segunda", "2026-10-05"],
    ["na segunda-feira", "2026-10-05"],
    ["quarta", "2026-10-07"],
    ["quarta passada", "2026-09-30"],
    ["sábado", "2026-10-03"],
    ["dia 5", "2026-10-05"],
    ["dia 20", "2026-09-20"],
    ["5/10", "2026-10-05"],
    ["25/12", "2025-12-25"],
    ["05/10/2026", "2026-10-05"],
    ["3 de outubro", "2026-10-03"],
    ["30 de setembro", "2026-09-30"],
  ])("%s -> %s", (texto, esperado) => {
    expect(resolverDataFalada(texto, HOJE)).toBe(esperado);
  });

  it("sem data entendível devolve null (vira hoje)", () => {
    expect(resolverDataFalada("", HOJE)).toBeNull();
    expect(resolverDataFalada("semana que vem", HOJE)).toBeNull();
    expect(montar("gastei 10 reais no posto", { valor: 10, dataTexto: "" }).dados.dia).toBe(HOJE);
  });

  it("data do modelo no futuro é ignorada", () => {
    expect(montar("gastei 10", { valor: 10, data: "2026-12-01" }).dados.dia).toBe(HOJE);
    expect(montar("gastei 10", { valor: 10, data: "2026-10-01" }).dados.dia).toBe("2026-10-01");
  });
});

describe("pedaços da regra", () => {
  it("valoresDoTexto", () => {
    expect(valoresDoTexto("250 reais de combustível")).toEqual([25000]);
    expect(valoresDoTexto("R$ 1.234,56 e mais 96")).toEqual([123456, 9600]);
    expect(valoresDoTexto("paguei 39,90")).toEqual([3990]);
  });

  it("valoresDoTexto entende valor por extenso (transcrição de áudio)", () => {
    expect(valoresDoTexto("duzentos e cinquenta reais de combustível")).toEqual([25000]);
    expect(valoresDoTexto("noventa e seis reais e cinquenta centavos")).toEqual([9650]);
    expect(valoresDoTexto("mil e quinhentos na madeireira")).toEqual([150000]);
    expect(valoresDoTexto("dois mil trezentos e quarenta")).toEqual([234000]);
    expect(valoresDoTexto("cem reais")).toEqual([10000]);
    expect(valoresDoTexto("almoço da equipe e o resto")).toEqual([]);
  });

  it("áudio com valor por extenso conta como valor escrito na mensagem", () => {
    const r = montar("Almoço, noventa e seis reais no restaurante Sabor Gaúcho, categoria alimentação, centro de custo instalação", {
      valor: 96,
      fornecedor: "Restaurante Sabor Gaúcho",
    });
    expect(r.valorNaMensagem).toBe(true);
    expect(r.registrarDireto).toBe(true);
  });

  it("trechoDeclarado", () => {
    const t = "Almoço, 96 reais, categoria alimentação, centro de custo instalação";
    expect(trechoDeclarado(t, "categoria")).toBe("alimentação");
    expect(trechoDeclarado(t, "centro")).toBe("instalação");
    expect(trechoDeclarado("categoria alimentação e centro produção", "categoria")).toBe("alimentação");
    expect(trechoDeclarado("categoria alimentação e centro produção", "centro")).toBe("produção");
    expect(trechoDeclarado("centro: obra do Arco-Íris", "centro")).toBe("obra do Arco-Íris");
    expect(trechoDeclarado("paguei 480 na madeireira", "categoria")).toBeNull();
  });

  it("resolverCategoria aproxima e recusa empate", () => {
    expect(resolverCategoria("alimentação", CATEGORIAS)?.id).toBe("alimentacao");
    expect(resolverCategoria("combustivel", CATEGORIAS)?.id).toBe("veiculos");
    expect(resolverCategoria("tarifa", CATEGORIAS)?.id).toBe("tarifas");
    expect(resolverCategoria("matéria prima", CATEGORIAS)?.id).toBe("materia");
    expect(resolverCategoria("xpto", CATEGORIAS)).toBeNull();
  });

  it("resolverCentro: centro geral primeiro, depois negócio", () => {
    expect(resolverCentro("equipe de instalação", CENTROS, NEGOCIOS)).toMatchObject({ tipo: "GERAL", id: "cg-instalacao" });
    expect(resolverCentro("veículo", CENTROS, NEGOCIOS)).toMatchObject({ tipo: "GERAL", id: "cg-veiculos" });
    expect(resolverCentro("obra do Arco-Íris", CENTROS, NEGOCIOS)).toMatchObject({ tipo: "NEGOCIO", id: "neg-arco" });
    expect(resolverCentro("condomínio bela vista", CENTROS, NEGOCIOS)).toMatchObject({ tipo: "NEGOCIO", id: "neg-bela" });
    expect(resolverCentro("obra", CENTROS, NEGOCIOS)).toBeNull();
  });

  it("fornecedorNaMensagem", () => {
    expect(fornecedorNaMensagem("Posto Ipiranga", "no posto ipiranga")).toBe(true);
    expect(fornecedorNaMensagem("Madeireira Pinheiro Ltda", "na madeireira Pinheiro")).toBe(true);
    expect(fornecedorNaMensagem("Posto Shell", "no posto ipiranga")).toBe(false);
  });

  it("negociosParecidos sugere quando o nome empata ou veio errado da transcrição", () => {
    const negocios = [
      { id: "a", titulo: "Kidplay Padel Sto Angelo", contatoNome: "Tiziano" },
      { id: "b", titulo: "Kidplay Escola Ijuí", contatoNome: "Escola São Francisco Ijuí" },
      { id: "c", titulo: "Playground Escola Arco-Íris", contatoNome: null },
    ];
    expect(resolverCentro("KidPlay e julho", CENTROS, negocios)).toBeNull();
    expect(negociosParecidos("KidPlay e julho", negocios).map((n) => n.id)).toEqual(["a", "b"]);
    expect(resolverCentro("Ijuí", CENTROS, negocios)).toMatchObject({ tipo: "NEGOCIO", id: "b" });
    expect(negociosParecidos("xpto", negocios)).toEqual([]);
  });

  it("pareceMesmaDespesa: mesmo valor, até 3 dias, fornecedor parecido", () => {
    const vaccari = { valorCentavos: 6600, dia: "2026-10-06", fornecedor: "Posto de Combustíveis Vaccari Ltda" };
    expect(pareceMesmaDespesa(vaccari, { valorCentavos: 6600, dia: "2026-10-07", fornecedor: "Posto Vaccari" })).toBe(true);
    expect(pareceMesmaDespesa(vaccari, { valorCentavos: 6600, dia: "2026-10-07", fornecedor: "" })).toBe(true);
    expect(pareceMesmaDespesa(vaccari, { valorCentavos: 6601, dia: "2026-10-06", fornecedor: "Posto Vaccari" })).toBe(false);
    expect(pareceMesmaDespesa(vaccari, { valorCentavos: 6600, dia: "2026-10-10", fornecedor: "Posto Vaccari" })).toBe(false);
    expect(pareceMesmaDespesa(vaccari, { valorCentavos: 6600, dia: "2026-10-06", fornecedor: "Restaurante Sabor Gaúcho" })).toBe(false);
  });

  it("pareceRespostaDeDespesa pega resumo inventado pelo modelo", () => {
    expect(pareceRespostaDeDespesa("Entendi assim, confere?\n💸 *R$ 250,00* — Posto\n\nResponda *1* para confirmar ou me diga o que corrigir.")).toBe(true);
    expect(pareceRespostaDeDespesa("✅ Registrado: R$ 96,00 em Sabor Gaúcho")).toBe(true);
    expect(pareceRespostaDeDespesa("Tarefa criada pra amanhã às 9h.")).toBe(false);
  });

  it("interpretarRespostaRascunho: texto", () => {
    expect(interpretarRespostaRascunho("1")).toBe("confirmar");
    expect(interpretarRespostaRascunho("Sim")).toBe("confirmar");
    expect(interpretarRespostaRascunho("ok!")).toBe("confirmar");
    expect(interpretarRespostaRascunho("pode registrar")).toBe("confirmar");
    expect(interpretarRespostaRascunho("cancela")).toBe("descartar");
    expect(interpretarRespostaRascunho("pode descartar")).toBe("descartar");
    expect(interpretarRespostaRascunho("não registra")).toBe("descartar");
    expect(interpretarRespostaRascunho("não")).toBe("duvida");
    expect(interpretarRespostaRascunho("não, foi 260")).toBe("outro");
    expect(interpretarRespostaRascunho("o centro é produção")).toBe("outro");
    expect(interpretarRespostaRascunho("é da obra do Arco-Íris")).toBe("outro");
  });

  it("interpretarRespostaRascunho: transcrição de áudio", () => {
    expect(interpretarRespostaRascunho("Sim, pode confirmar.")).toBe("confirmar");
    expect(interpretarRespostaRascunho("Um.")).toBe("confirmar");
    expect(interpretarRespostaRascunho("Tá certo, pode registrar.")).toBe("confirmar");
    expect(interpretarRespostaRascunho("Isso mesmo, confirma aí.")).toBe("confirmar");
    expect(interpretarRespostaRascunho("Confirma, por favor.")).toBe("confirmar");
    expect(interpretarRespostaRascunho("Não, cancela essa despesa.")).toBe("descartar");
    expect(interpretarRespostaRascunho("Não.")).toBe("duvida");
    expect(interpretarRespostaRascunho("Sim, mas o valor foi 260 reais.")).toBe("outro");
    expect(interpretarRespostaRascunho("Paguei 50 reais de pedágio")).toBe("outro");
  });
});

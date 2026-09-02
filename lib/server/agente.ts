import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { criarContato, atualizarContato } from "@/lib/server/contatos";
import {
  salvarOrcamento,
  buscarOrcamentoPorId,
  listarOrcamentos,
  garantirTokenPublico,
  calcularTotalCentavos,
  atualizarStatusOrcamento,
  excluirOrcamento,
} from "@/lib/server/orcamentos";
import { criarTarefa, listTarefas, atualizarTarefa } from "@/lib/server/tarefas";
import {
  criarProduto,
  atualizarProduto,
  atualizarPrecoProduto,
  type CampoPrecoProduto,
} from "@/lib/server/produtos";
import {
  listFunisComEtapas,
  criarNegocio,
  moverNegocio,
  atualizarDadosNegocio,
  marcarNegocioPerdido,
  adicionarNotaHistorico,
} from "@/lib/server/negocios";
import { encontrarOuCriarConversaPorTelefone, registrarMensagem } from "@/lib/server/conversas";
import { enviarEmail, emailConfigurado } from "@/lib/server/email";
import { gerarHtmlEmailOrcamento, gerarTextoAlternativoEmailOrcamento } from "@/lib/server/orcamento-email";
import { gerarPdfOrcamento } from "@/lib/server/pdf/orcamento-pdf";
import {
  buscarClientesSimilar,
  buscarProdutosSimilar,
  buscarNegociosSimilarIds,
  buscarTarefasSimilarIds,
  buscarCotacoesSimilar,
  buscarContratosSimilarIds,
} from "@/lib/server/busca-similar";
import { calcularCotacao, type MaoDeObraItem } from "@/lib/utils/cotacao-precificacao";
import { buscarCotacaoPorId } from "@/lib/server/cotacoes";
import { listarContratos } from "@/lib/server/contratos";
import { reaisParaCentavos, centavosParaReais } from "@/lib/utils/money";
import { URL_BASE } from "@/lib/constants/app";
import type { OrigemComando, StatusOrcamento } from "@prisma/client";

const MODELO = "claude-sonnet-5";
const JANELA_PENDENTE_MS = 10 * 60 * 1000; // 10 minutos pra confirmar antes de expirar

// ---------------------------------------------------------------------------
// Ferramentas — cada uma vira uma "tool" pro Claude decidir chamar. As
// marcadas sensivel:true nunca executam na primeira vez: viram uma pergunta
// de confirmação (ver processarComandoAgente) e só rodam de verdade se a
// PRÓXIMA mensagem da mesma origem (telefone no WhatsApp, "crm:<userId>" no
// CRM) confirmar. Edições internas (cliente, produto, orçamento, negócio,
// tarefa) executam direto — só ações que saem do CRM (WhatsApp, e-mail) ou
// que apagam dado (excluir orçamento, marcar negócio perdido) pedem
// confirmação.
// ---------------------------------------------------------------------------

// JSON Schema simplificado, só o suficiente pro parâmetro `tools` da API da
// Anthropic — evita depender de um tipo aninhado da SDK que pode mudar de
// versão pra versão.
type EsquemaEntrada = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
};

type ArgsFerramenta = Record<string, unknown>;

type Ferramenta = {
  name: string;
  description: string;
  input_schema: EsquemaEntrada;
  sensivel?: boolean;
  descreverAcao?: (args: ArgsFerramenta) => Promise<string>;
  executar: (args: ArgsFerramenta, ctx: { usuarioId: string }) => Promise<unknown>;
};

/**
 * Resolve um orçamento por ID interno OU por número humano ("orçamento nº
 * 8") — o histórico de conversa do agente só guarda o texto da resposta
 * final, que menciona o número, não o ID interno, então o número precisa
 * funcionar sozinho quando o agente lembra de um orçamento citado antes.
 */
async function resolverOrcamento(args: { orcamentoId?: string; numero?: number }) {
  if (args.orcamentoId) {
    const orcamento = await buscarOrcamentoPorId(args.orcamentoId);
    if (orcamento) return orcamento;
  }
  if (args.numero) {
    const todos = await listarOrcamentos();
    const encontrado = todos.find((o) => o.numero === args.numero);
    if (encontrado) return buscarOrcamentoPorId(encontrado.id);
  }
  return null;
}

/**
 * Resolve uma entidade por ID direto OU por busca aproximada de nome/título.
 * Se a busca achar mais de um resultado, devolve os candidatos pra ferramenta
 * retornar `{ambiguo:true, opcoes}` em vez de chutar qual o usuário quis dizer.
 */
async function resolverPorBusca(
  idFornecido: string | undefined,
  termoBusca: string | undefined,
  buscarIds: (termo: string) => Promise<string[]>,
): Promise<{ id: string } | { ambiguo: true; ids: string[] } | null> {
  if (idFornecido) return { id: idFornecido };
  if (!termoBusca) return null;
  const ids = await buscarIds(termoBusca);
  if (ids.length === 0) return null;
  if (ids.length === 1) return { id: ids[0] };
  return { ambiguo: true, ids };
}

const FERRAMENTAS: Ferramenta[] = [
  {
    name: "buscar_clientes",
    description:
      "Busca clientes/contatos cadastrados por nome ou razão social — busca aproximada tipo Google, tolera erro de digitação e falta de acento/hífen. Use antes de criar ou editar algo vinculado a um cliente pra achar o ID certo.",
    input_schema: {
      type: "object",
      properties: { termo: { type: "string", description: "Nome ou parte do nome do cliente" } },
      required: ["termo"],
    },
    async executar(args) {
      const { termo } = args as { termo: string };
      const clientes = await buscarClientesSimilar(termo);
      return clientes.length > 0 ? clientes : "Nenhum cliente encontrado com esse nome.";
    },
  },
  {
    name: "criar_cliente",
    description: "Cria um cliente novo, quando o comando menciona um cliente que ainda não existe no cadastro.",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string" },
        telefone: { type: "string", description: "Com DDD, só números, opcional" },
      },
      required: ["nome"],
    },
    async executar(args) {
      const { nome, telefone } = args as { nome: string; telefone?: string };
      const contato = await criarContato({ nome, telefone: telefone || null, tipo: "CLIENTE" });
      return { id: contato.id, nome: contato.nome };
    },
  },
  {
    name: "atualizar_cliente",
    description:
      "Edita os dados de um cliente já cadastrado (nome, telefone, e-mail, empresa, CNPJ, razão social, endereço, representante legal). Informe clienteId (se já souber) ou nomeBusca. Só os campos passados são alterados. O nome e CPF do representante legal e a razão social/CNPJ/endereço são exigidos antes de marcar um negócio desse cliente como Ganho (pro contrato).",
    input_schema: {
      type: "object",
      properties: {
        clienteId: { type: "string" },
        nomeBusca: { type: "string", description: "Nome do cliente, alternativa a clienteId" },
        novoNome: { type: "string" },
        novoTelefone: { type: "string" },
        novoEmail: { type: "string" },
        novaEmpresa: { type: "string" },
        novoCnpj: { type: "string" },
        novaRazaoSocial: { type: "string" },
        novoEndereco: { type: "string" },
        novaCidade: { type: "string" },
        novoUf: { type: "string" },
        novoCep: { type: "string" },
        novoRepresentanteLegalNome: { type: "string", description: "Nome de quem assina pela empresa cliente" },
        novoRepresentanteLegalCpf: { type: "string", description: "CPF de quem assina pela empresa cliente" },
      },
    },
    async executar(args) {
      const a = args as {
        clienteId?: string;
        nomeBusca?: string;
        novoNome?: string;
        novoTelefone?: string;
        novoEmail?: string;
        novaEmpresa?: string;
        novoCnpj?: string;
        novaRazaoSocial?: string;
        novoEndereco?: string;
        novaCidade?: string;
        novoUf?: string;
        novoCep?: string;
        novoRepresentanteLegalNome?: string;
        novoRepresentanteLegalCpf?: string;
      };
      const resolvido = await resolverPorBusca(a.clienteId, a.nomeBusca, (t) =>
        buscarClientesSimilar(t, 5).then((c) => c.map((x) => x.id)),
      );
      if (!resolvido) throw new Error(`Não achei nenhum cliente parecido com "${a.nomeBusca}".`);
      if ("ambiguo" in resolvido) {
        const opcoes = await prisma.contato.findMany({ where: { id: { in: resolvido.ids } }, select: { id: true, nome: true } });
        return { ambiguo: true, opcoes };
      }
      const atualizado = await atualizarContato(resolvido.id, {
        nome: a.novoNome,
        telefone: a.novoTelefone,
        email: a.novoEmail,
        empresa: a.novaEmpresa,
        cnpj: a.novoCnpj,
        razaoSocial: a.novaRazaoSocial,
        endereco: a.novoEndereco,
        cidade: a.novaCidade,
        uf: a.novoUf,
        cep: a.novoCep,
        representanteLegalNome: a.novoRepresentanteLegalNome,
        representanteLegalCpf: a.novoRepresentanteLegalCpf,
      });
      return { id: atualizado.id, nome: atualizado.nome };
    },
  },
  {
    name: "buscar_produtos",
    description:
      "Busca produtos do catálogo por nome ou código — busca aproximada tipo Google (ex: 'PL010' acha 'Playground PL-010'). Use antes de criar orçamento ou editar preço.",
    input_schema: {
      type: "object",
      properties: { termo: { type: "string" } },
      required: ["termo"],
    },
    async executar(args) {
      const { termo } = args as { termo: string };
      const produtos = await buscarProdutosSimilar(termo);
      return produtos.length > 0
        ? produtos.map((p) => ({ ...p, valor: p.valorCentavos != null ? centavosParaReais(p.valorCentavos) : "sem valor cadastrado" }))
        : "Nenhum produto encontrado com esse nome.";
    },
  },
  {
    name: "criar_produto",
    description: "Cadastra um produto novo no catálogo.",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string" },
        codigo: { type: "string" },
        categoria: {
          type: "string",
          description:
            "Playground, Parque Infantil, Parque Infantil Baby, Parque Infantil PNE, Kidplay, Pisos, Academia Aberta, Mobiliário, Outros Produtos, Linha Rotomoldados ou Pedagógicos",
        },
        descricao: { type: "string" },
        valorReais: { type: "number", description: "Preço de venda, se já souber" },
      },
      required: ["nome", "categoria"],
    },
    async executar(args) {
      const { nome, codigo, categoria, descricao, valorReais } = args as {
        nome: string;
        codigo?: string;
        categoria: string;
        descricao?: string;
        valorReais?: number;
      };
      const produto = await criarProduto({
        nome,
        codigo: codigo || null,
        categoria,
        descricao: descricao || null,
        valorCentavos: valorReais != null ? reaisParaCentavos(valorReais) : null,
      });
      return { id: produto.id, nome: produto.nome, codigo: produto.codigo };
    },
  },
  {
    name: "atualizar_produto",
    description: "Edita nome, código, categoria, descrição, preço de venda ou situação (ativo/inativo) de um produto já cadastrado.",
    input_schema: {
      type: "object",
      properties: {
        produtoId: { type: "string" },
        nomeBusca: { type: "string", description: "Nome ou código do produto, alternativa a produtoId" },
        novoNome: { type: "string" },
        novoCodigo: { type: "string" },
        novaCategoria: { type: "string" },
        novaDescricao: { type: "string" },
        novoValorReais: { type: "number" },
        ativo: { type: "boolean" },
      },
    },
    async executar(args) {
      const a = args as {
        produtoId?: string;
        nomeBusca?: string;
        novoNome?: string;
        novoCodigo?: string;
        novaCategoria?: string;
        novaDescricao?: string;
        novoValorReais?: number;
        ativo?: boolean;
      };
      const resolvido = await resolverPorBusca(a.produtoId, a.nomeBusca, (t) =>
        buscarProdutosSimilar(t, 5).then((p) => p.map((x) => x.id)),
      );
      if (!resolvido) throw new Error(`Não achei nenhum produto parecido com "${a.nomeBusca}".`);
      if ("ambiguo" in resolvido) {
        const opcoes = await prisma.produto.findMany({ where: { id: { in: resolvido.ids } }, select: { id: true, nome: true, codigo: true } });
        return { ambiguo: true, opcoes };
      }
      const produto = await atualizarProduto(resolvido.id, {
        nome: a.novoNome,
        codigo: a.novoCodigo,
        categoria: a.novaCategoria,
        descricao: a.novaDescricao,
        valorCentavos: a.novoValorReais != null ? reaisParaCentavos(a.novoValorReais) : undefined,
        ativo: a.ativo,
      });
      return { id: produto.id, nome: produto.nome };
    },
  },
  {
    name: "atualizar_preco_produto",
    description:
      "Altera um campo da Lista de Preços de um produto (custo de compra, frete, IPI, outros custos, instalação, quantidade de referência, markup % ou imposto %) — o preço de venda é recalculado automaticamente.",
    input_schema: {
      type: "object",
      properties: {
        produtoId: { type: "string" },
        nomeBusca: { type: "string", description: "Nome ou código do produto, alternativa a produtoId" },
        campo: {
          type: "string",
          enum: [
            "custoCompraCentavos",
            "freteCustoCentavos",
            "ipiCustoCentavos",
            "outrosCustoCentavos",
            "quantidadeReferencia",
            "markupPercentual",
            "impostoPercentual",
            "instalacaoCentavos",
          ],
        },
        valor: {
          type: "number",
          description: "Em reais pros campos de custo/instalação, percentual pra markup/imposto (ex: 30 = 30%), ou a quantidade em si",
        },
      },
      required: ["campo", "valor"],
    },
    async executar(args) {
      const a = args as { produtoId?: string; nomeBusca?: string; campo: CampoPrecoProduto; valor: number };
      const resolvido = await resolverPorBusca(a.produtoId, a.nomeBusca, (t) =>
        buscarProdutosSimilar(t, 5).then((p) => p.map((x) => x.id)),
      );
      if (!resolvido) throw new Error(`Não achei nenhum produto parecido com "${a.nomeBusca}".`);
      if ("ambiguo" in resolvido) {
        const opcoes = await prisma.produto.findMany({ where: { id: { in: resolvido.ids } }, select: { id: true, nome: true, codigo: true } });
        return { ambiguo: true, opcoes };
      }
      const camposEmCentavos = ["custoCompraCentavos", "freteCustoCentavos", "ipiCustoCentavos", "outrosCustoCentavos", "instalacaoCentavos"];
      const valorFinal = camposEmCentavos.includes(a.campo) ? reaisParaCentavos(a.valor) : a.valor;
      const produto = await atualizarPrecoProduto(resolvido.id, a.campo, valorFinal);
      return {
        id: produto.id,
        nome: produto.nome,
        campoAlterado: a.campo,
        novoValorVenda: produto.valorCentavos != null ? centavosParaReais(produto.valorCentavos) : "sem custo lançado ainda",
      };
    },
  },
  {
    name: "buscar_orcamentos",
    description: "Lista orçamentos recentes, opcionalmente filtrando por número ou nome do cliente.",
    input_schema: {
      type: "object",
      properties: {
        numero: { type: "integer", description: "Número do orçamento, se o comando mencionar um específico" },
        clienteNome: { type: "string" },
      },
    },
    async executar(args) {
      const { numero, clienteNome } = args as { numero?: number; clienteNome?: string };
      const todos = await listarOrcamentos();
      let filtrados = todos;
      if (numero) filtrados = filtrados.filter((o) => o.numero === numero);
      if (clienteNome) {
        const termo = clienteNome.toLowerCase();
        filtrados = filtrados.filter((o) => o.contato?.nome.toLowerCase().includes(termo));
      }
      return filtrados.slice(0, 8).map((o) => ({
        id: o.id,
        numero: o.numero,
        cliente: o.contato?.nome ?? "sem cliente",
        status: o.status,
        total: centavosParaReais(calcularTotalCentavos(o.itens, o.descontoCentavos)),
      }));
    },
  },
  {
    name: "criar_orcamento",
    description:
      "Cria um orçamento novo (rascunho) com um ou mais itens. Pra cada item, informe produtoId (achado com buscar_produtos) OU um item avulso com nome/valor próprios.",
    input_schema: {
      type: "object",
      properties: {
        clienteId: { type: "string", description: "ID do cliente, se já souber (de buscar_clientes)" },
        itens: {
          type: "array",
          items: {
            type: "object",
            properties: {
              produtoId: { type: "string" },
              nome: { type: "string", description: "Nome do item (obrigatório se não for produtoId)" },
              quantidade: { type: "integer", default: 1 },
              valorUnitarioReais: { type: "number", description: "Só se for item avulso ou pra sobrescrever o preço do produto" },
            },
          },
        },
        observacoes: { type: "string" },
      },
      required: ["itens"],
    },
    async executar(args, { usuarioId }) {
      const { clienteId, itens, observacoes } = args as {
        clienteId?: string;
        observacoes?: string;
        itens: { produtoId?: string; nome?: string; quantidade?: number; valorUnitarioReais?: number }[];
      };
      const itensResolvidos = [];
      for (const item of itens) {
        if (item.produtoId) {
          const produto = await prisma.produto.findUnique({ where: { id: item.produtoId } });
          if (!produto) continue;
          itensResolvidos.push({
            produtoId: produto.id,
            nome: produto.nome,
            descricao: produto.descricao,
            quantidade: Math.max(1, item.quantidade || 1),
            valorUnitarioCentavos: item.valorUnitarioReais != null ? reaisParaCentavos(item.valorUnitarioReais) : produto.valorCentavos ?? 0,
          });
        } else {
          itensResolvidos.push({
            produtoId: null,
            nome: item.nome || "Item",
            quantidade: Math.max(1, item.quantidade || 1),
            valorUnitarioCentavos: reaisParaCentavos(item.valorUnitarioReais || 0),
          });
        }
      }
      if (itensResolvidos.length === 0) throw new Error("Nenhum item válido informado.");

      const orcamento = await salvarOrcamento({
        contatoId: clienteId || null,
        responsavelId: usuarioId,
        observacoes: observacoes || null,
        itens: itensResolvidos,
      });
      const total = calcularTotalCentavos(itensResolvidos, 0);
      return { id: orcamento.id, numero: orcamento.numero, total: centavosParaReais(total) };
    },
  },
  {
    name: "atualizar_orcamento",
    description:
      "Edita um orçamento já existente: adiciona itens, remove itens pelo nome, muda o desconto ou as observações. Informe orcamentoId ou numero. Só passe os campos que quer mudar — os itens existentes que não forem removidos continuam no orçamento.",
    input_schema: {
      type: "object",
      properties: {
        orcamentoId: { type: "string" },
        numero: { type: "integer" },
        adicionarItens: {
          type: "array",
          items: {
            type: "object",
            properties: {
              produtoId: { type: "string" },
              nome: { type: "string" },
              quantidade: { type: "integer", default: 1 },
              valorUnitarioReais: { type: "number" },
            },
          },
        },
        removerItensComNome: { type: "array", items: { type: "string" }, description: "Nome (ou parte do nome) de cada item a remover" },
        novoDesconto: { type: "number", description: "Novo valor de desconto em reais, substitui o atual" },
        novasObservacoes: { type: "string" },
      },
    },
    async executar(args, { usuarioId }) {
      const a = args as {
        orcamentoId?: string;
        numero?: number;
        adicionarItens?: { produtoId?: string; nome?: string; quantidade?: number; valorUnitarioReais?: number }[];
        removerItensComNome?: string[];
        novoDesconto?: number;
        novasObservacoes?: string;
      };
      const orcamento = await resolverOrcamento(a);
      if (!orcamento) throw new Error("Orçamento não encontrado.");

      let itensFinais = orcamento.itens.map((i) => ({
        produtoId: i.produtoId,
        nome: i.nome,
        descricao: i.descricao,
        quantidade: i.quantidade,
        valorUnitarioCentavos: i.valorUnitarioCentavos,
      }));

      if (a.removerItensComNome && a.removerItensComNome.length > 0) {
        const termos = a.removerItensComNome.map((t) => t.toLowerCase());
        itensFinais = itensFinais.filter((i) => !termos.some((t) => i.nome.toLowerCase().includes(t)));
      }

      if (a.adicionarItens && a.adicionarItens.length > 0) {
        for (const item of a.adicionarItens) {
          if (item.produtoId) {
            const produto = await prisma.produto.findUnique({ where: { id: item.produtoId } });
            if (!produto) continue;
            itensFinais.push({
              produtoId: produto.id,
              nome: produto.nome,
              descricao: produto.descricao,
              quantidade: Math.max(1, item.quantidade || 1),
              valorUnitarioCentavos: item.valorUnitarioReais != null ? reaisParaCentavos(item.valorUnitarioReais) : produto.valorCentavos ?? 0,
            });
          } else {
            itensFinais.push({
              produtoId: null,
              nome: item.nome || "Item",
              descricao: null,
              quantidade: Math.max(1, item.quantidade || 1),
              valorUnitarioCentavos: reaisParaCentavos(item.valorUnitarioReais || 0),
            });
          }
        }
      }

      if (itensFinais.length === 0) throw new Error("O orçamento ficaria sem nenhum item — operação cancelada.");

      const descontoCentavos = a.novoDesconto != null ? reaisParaCentavos(a.novoDesconto) : orcamento.descontoCentavos;
      const atualizado = await salvarOrcamento({
        orcamentoId: orcamento.id,
        contatoId: orcamento.contatoId,
        responsavelId: usuarioId,
        observacoes: a.novasObservacoes !== undefined ? a.novasObservacoes : orcamento.observacoes,
        descontoCentavos,
        itens: itensFinais,
      });
      const total = calcularTotalCentavos(itensFinais, descontoCentavos);
      return { numero: atualizado.numero, totalItens: itensFinais.length, total: centavosParaReais(total) };
    },
  },
  {
    name: "atualizar_status_orcamento",
    description: "Muda o status de um orçamento (rascunho, enviado, aprovado, recusado, expirado).",
    input_schema: {
      type: "object",
      properties: {
        orcamentoId: { type: "string" },
        numero: { type: "integer" },
        novoStatus: { type: "string", enum: ["RASCUNHO", "ENVIADO", "APROVADO", "RECUSADO", "EXPIRADO"] },
      },
      required: ["novoStatus"],
    },
    async executar(args) {
      const a = args as { orcamentoId?: string; numero?: number; novoStatus: StatusOrcamento };
      const orcamento = await resolverOrcamento(a);
      if (!orcamento) throw new Error("Orçamento não encontrado.");
      await atualizarStatusOrcamento(orcamento.id, a.novoStatus);
      return { numero: orcamento.numero, novoStatus: a.novoStatus };
    },
  },
  {
    name: "excluir_orcamento",
    description: "Apaga um orçamento definitivamente. Ação sensível — sempre pede confirmação antes.",
    input_schema: {
      type: "object",
      properties: { orcamentoId: { type: "string" }, numero: { type: "integer" } },
    },
    sensivel: true,
    async descreverAcao(args) {
      const orcamento = await resolverOrcamento(args as { orcamentoId?: string; numero?: number });
      if (!orcamento) return "orçamento não encontrado";
      return `apagar o orçamento #${String(orcamento.numero).padStart(4, "0")} de ${orcamento.contato?.nome ?? "cliente sem nome"} — essa ação não pode ser desfeita`;
    },
    async executar(args) {
      const orcamento = await resolverOrcamento(args as { orcamentoId?: string; numero?: number });
      if (!orcamento) throw new Error("Orçamento não encontrado.");
      await excluirOrcamento(orcamento.id);
      return { apagado: true, numero: orcamento.numero };
    },
  },
  {
    name: "enviar_orcamento_whatsapp",
    description:
      "Envia um orçamento já criado pro WhatsApp do cliente. Ação sensível — sempre pede confirmação antes. Informe orcamentoId (se tiver, ex: veio de buscar_orcamentos/criar_orcamento nessa mesma conversa) OU numero (o número humano do orçamento, ex: 8 — funciona mesmo sem saber o ID interno).",
    input_schema: {
      type: "object",
      properties: {
        orcamentoId: { type: "string" },
        numero: { type: "integer", description: "Número do orçamento (ex: 8), alternativa ao orcamentoId" },
        telefone: { type: "string", description: "Com DDD, só números — usa o telefone do cliente vinculado se não informado" },
      },
    },
    sensivel: true,
    async descreverAcao(args) {
      const orcamento = await resolverOrcamento(args as { orcamentoId?: string; numero?: number });
      if (!orcamento) return "orçamento não encontrado";
      const total = calcularTotalCentavos(orcamento.itens, orcamento.descontoCentavos);
      return `enviar o orçamento #${String(orcamento.numero).padStart(4, "0")} (${centavosParaReais(total)}), com o PDF anexado, pro WhatsApp de ${orcamento.contato?.nome ?? "cliente sem nome vinculado"}`;
    },
    async executar(args) {
      const { telefone } = args as { telefone?: string };
      const orcamento = await resolverOrcamento(args as { orcamentoId?: string; numero?: number });
      if (!orcamento) throw new Error("Orçamento não encontrado.");
      const telefoneFinal = (telefone || orcamento.contato?.telefone || "").replace(/\D/g, "");
      if (telefoneFinal.length < 10) throw new Error("Não tenho um telefone válido pra esse cliente.");

      const token = await garantirTokenPublico(orcamento.id);
      const link = `${URL_BASE}/publico/orcamento/${token}`;
      const total = calcularTotalCentavos(orcamento.itens, orcamento.descontoCentavos);
      const texto =
        `Olá! Segue o orçamento *#${String(orcamento.numero).padStart(4, "0")}* da Legaus Kids, ` +
        `no valor de ${centavosParaReais(total)}.\n\nVocê pode conferir todos os detalhes aqui: ${link}\n\nQualquer dúvida, estamos à disposição!`;

      const conversa = await encontrarOuCriarConversaPorTelefone({ telefone: telefoneFinal, nomeContato: orcamento.contato?.nome });
      await registrarMensagem({
        conversaId: conversa.id,
        texto,
        direcao: "SAIDA",
        origem: "SISTEMA",
        anexoUrl: `${URL_BASE}/api/pdf/orcamento/${orcamento.id}`,
        anexoNome: `orcamento-${String(orcamento.numero).padStart(4, "0")}.pdf`,
        anexoMimetype: "application/pdf",
      });
      return { enviado: true, numero: orcamento.numero };
    },
  },
  {
    name: "enviar_orcamento_email",
    description:
      "Envia um orçamento já criado por e-mail pro cliente. Ação sensível — sempre pede confirmação antes. Informe orcamentoId ou numero.",
    input_schema: {
      type: "object",
      properties: {
        orcamentoId: { type: "string" },
        numero: { type: "integer" },
        email: { type: "string", description: "Opcional — usa o e-mail do cliente vinculado se não informado" },
      },
    },
    sensivel: true,
    async descreverAcao(args) {
      const a = args as { orcamentoId?: string; numero?: number; email?: string };
      const orcamento = await resolverOrcamento(a);
      if (!orcamento) return "orçamento não encontrado";
      const total = calcularTotalCentavos(orcamento.itens, orcamento.descontoCentavos);
      const destino = a.email || orcamento.contato?.email || "e-mail não informado";
      return `enviar o orçamento #${String(orcamento.numero).padStart(4, "0")} (${centavosParaReais(total)}) por e-mail pra ${destino}`;
    },
    async executar(args) {
      const a = args as { orcamentoId?: string; numero?: number; email?: string };
      const orcamento = await resolverOrcamento(a);
      if (!orcamento) throw new Error("Orçamento não encontrado.");
      const emailFinal = a.email || orcamento.contato?.email;
      if (!emailFinal) throw new Error("Não tenho um e-mail válido pra esse cliente.");
      if (!emailConfigurado()) throw new Error("Envio de e-mail não está configurado no servidor.");

      const token = await garantirTokenPublico(orcamento.id);
      const link = `${URL_BASE}/publico/orcamento/${token}`;
      const html = gerarHtmlEmailOrcamento({
        numero: orcamento.numero,
        status: orcamento.status,
        validadeDias: orcamento.validadeDias,
        createdAt: orcamento.createdAt,
        observacoes: orcamento.observacoes,
        descontoCentavos: orcamento.descontoCentavos,
        clienteNome: orcamento.contato?.nome ?? "Cliente",
        itens: orcamento.itens.map((i) => ({
          nome: i.nome,
          quantidade: i.quantidade,
          valorUnitarioCentavos: i.valorUnitarioCentavos,
          imagemUrl: i.produto?.imagemUrl ?? null,
        })),
        link,
      });
      const textoAlt = gerarTextoAlternativoEmailOrcamento(orcamento.numero, link);
      const { buffer: pdfBuffer, nomeArquivo: pdfNome } = await gerarPdfOrcamento(orcamento.id);
      await enviarEmail({
        para: emailFinal,
        assunto: `Orçamento nº ${String(orcamento.numero).padStart(4, "0")} — Legaus Kids`,
        html,
        textoAlternativo: textoAlt,
        anexos: [{ nomeArquivo: pdfNome, conteudo: pdfBuffer }],
      });
      return { enviado: true, numero: orcamento.numero, email: emailFinal };
    },
  },
  {
    name: "obter_link_pdf_orcamento",
    description: "Gera o link de download do PDF de um orçamento, pra mandar aqui mesmo no chat (não é uma ação sensível, só um link de leitura). Informe orcamentoId ou numero.",
    input_schema: {
      type: "object",
      properties: { orcamentoId: { type: "string" }, numero: { type: "integer" } },
    },
    async executar(args) {
      const orcamento = await resolverOrcamento(args as { orcamentoId?: string; numero?: number });
      if (!orcamento) throw new Error("Orçamento não encontrado.");
      // ?v=<updatedAt> pra garantir um link diferente a cada edição — sem isso o
      // Marcos recebia "o mesmo link de sempre" depois de editar o orçamento, e o
      // navegador podia mostrar uma versão em cache em vez de gerar de novo.
      return { url: `${URL_BASE}/api/pdf/orcamento/${orcamento.id}?v=${orcamento.updatedAt.getTime()}`, numero: orcamento.numero };
    },
  },
  {
    name: "buscar_funis_etapas",
    description: "Lista os funis de venda e as etapas de cada um, com seus IDs — use antes de criar_negocio ou mover_negocio_etapa pra saber os IDs certos.",
    input_schema: { type: "object", properties: {} },
    async executar() {
      const funis = await listFunisComEtapas();
      return funis.map((f) => ({ funilId: f.id, funil: f.nome, etapas: f.etapas.map((e) => ({ etapaId: e.id, etapa: e.nome, tipo: e.tipo })) }));
    },
  },
  {
    name: "buscar_negocios",
    description: "Busca negócios em andamento por título ou nome do cliente — busca aproximada tipo Google. Deixe termo vazio pra listar os mais recentes.",
    input_schema: {
      type: "object",
      properties: { termo: { type: "string", description: "Título do negócio ou nome do cliente, opcional" } },
    },
    async executar(args) {
      const { termo } = args as { termo?: string };
      const include = { contato: true, etapa: true, funil: true } as const;
      let negocios;
      if (termo) {
        const ids = await buscarNegociosSimilarIds(termo);
        const encontrados = await prisma.negocio.findMany({ where: { id: { in: ids } }, include });
        negocios = encontrados.sort((x, y) => ids.indexOf(x.id) - ids.indexOf(y.id));
      } else {
        negocios = await prisma.negocio.findMany({ include, orderBy: { updatedAt: "desc" }, take: 8 });
      }
      return negocios.length > 0
        ? negocios.map((n) => ({
            id: n.id,
            titulo: n.titulo,
            cliente: n.contato?.nome ?? "sem cliente",
            etapa: n.etapa.nome,
            funil: n.funil.nome,
            valor: centavosParaReais(n.valorCentavos),
          }))
        : "Nenhum negócio encontrado.";
    },
  },
  {
    name: "criar_negocio",
    description:
      "Cria um negócio novo num funil de vendas. Use buscar_funis_etapas antes pra saber funilId/etapaId, e buscar_clientes se precisar do ID do cliente.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        clienteId: { type: "string" },
        funilId: { type: "string" },
        etapaId: { type: "string" },
        valorReais: { type: "number" },
        produto: { type: "string" },
        descricao: { type: "string" },
      },
      required: ["titulo", "funilId", "etapaId"],
    },
    async executar(args, { usuarioId }) {
      const a = args as {
        titulo: string;
        clienteId?: string;
        funilId: string;
        etapaId: string;
        valorReais?: number;
        produto?: string;
        descricao?: string;
      };
      const negocio = await criarNegocio({
        titulo: a.titulo,
        contatoId: a.clienteId || null,
        funilId: a.funilId,
        etapaId: a.etapaId,
        valorCentavos: reaisParaCentavos(a.valorReais || 0),
        responsavelId: usuarioId,
        produto: a.produto || null,
        descricao: a.descricao || null,
      });
      return { id: negocio.id, titulo: negocio.titulo };
    },
  },
  {
    name: "mover_negocio_etapa",
    description: "Move um negócio pra outra etapa do funil. Informe negocioId ou tituloBusca, e novaEtapaId (veja buscar_funis_etapas).",
    input_schema: {
      type: "object",
      properties: {
        negocioId: { type: "string" },
        tituloBusca: { type: "string", description: "Título do negócio ou nome do cliente, alternativa a negocioId" },
        novaEtapaId: { type: "string" },
      },
      required: ["novaEtapaId"],
    },
    async executar(args) {
      const a = args as { negocioId?: string; tituloBusca?: string; novaEtapaId: string };
      const resolvido = await resolverPorBusca(a.negocioId, a.tituloBusca, buscarNegociosSimilarIds);
      if (!resolvido) throw new Error(`Não achei nenhum negócio parecido com "${a.tituloBusca}".`);
      if ("ambiguo" in resolvido) {
        const opcoes = await prisma.negocio.findMany({ where: { id: { in: resolvido.ids } }, select: { id: true, titulo: true } });
        return { ambiguo: true, opcoes };
      }
      await moverNegocio(resolvido.id, a.novaEtapaId);
      return { id: resolvido.id, novaEtapaId: a.novaEtapaId };
    },
  },
  {
    name: "atualizar_negocio",
    description:
      "Edita valor, produto, descrição ou forma de pagamento de um negócio já existente. Informe negocioId ou tituloBusca. A forma de pagamento é exigida antes de marcar o negócio como Ganho (vai pro contrato).",
    input_schema: {
      type: "object",
      properties: {
        negocioId: { type: "string" },
        tituloBusca: { type: "string" },
        novoValorReais: { type: "number" },
        novoProduto: { type: "string" },
        novaDescricao: { type: "string" },
        novaFormaPagamento: { type: "string", description: "ex: à vista via PIX, no ato da assinatura" },
      },
    },
    async executar(args) {
      const a = args as {
        negocioId?: string;
        tituloBusca?: string;
        novoValorReais?: number;
        novoProduto?: string;
        novaDescricao?: string;
        novaFormaPagamento?: string;
      };
      const resolvido = await resolverPorBusca(a.negocioId, a.tituloBusca, buscarNegociosSimilarIds);
      if (!resolvido) throw new Error(`Não achei nenhum negócio parecido com "${a.tituloBusca}".`);
      if ("ambiguo" in resolvido) {
        const opcoes = await prisma.negocio.findMany({ where: { id: { in: resolvido.ids } }, select: { id: true, titulo: true } });
        return { ambiguo: true, opcoes };
      }
      const negocio = await atualizarDadosNegocio(resolvido.id, {
        valorCentavos: a.novoValorReais != null ? reaisParaCentavos(a.novoValorReais) : undefined,
        produto: a.novoProduto,
        descricao: a.novaDescricao,
        formaPagamento: a.novaFormaPagamento,
      });
      return { id: negocio.id, titulo: negocio.titulo };
    },
  },
  {
    name: "adicionar_nota_negocio",
    description: "Adiciona uma nota/anotação no histórico de um negócio. Informe negocioId ou tituloBusca.",
    input_schema: {
      type: "object",
      properties: {
        negocioId: { type: "string" },
        tituloBusca: { type: "string" },
        texto: { type: "string" },
      },
      required: ["texto"],
    },
    async executar(args, { usuarioId }) {
      const a = args as { negocioId?: string; tituloBusca?: string; texto: string };
      const resolvido = await resolverPorBusca(a.negocioId, a.tituloBusca, buscarNegociosSimilarIds);
      if (!resolvido) throw new Error(`Não achei nenhum negócio parecido com "${a.tituloBusca}".`);
      if ("ambiguo" in resolvido) {
        const opcoes = await prisma.negocio.findMany({ where: { id: { in: resolvido.ids } }, select: { id: true, titulo: true } });
        return { ambiguo: true, opcoes };
      }
      await adicionarNotaHistorico(resolvido.id, a.texto, usuarioId);
      return { anotado: true };
    },
  },
  {
    name: "marcar_negocio_perdido",
    description: "Marca um negócio como perdido, com motivo. Ação sensível — sempre pede confirmação antes.",
    input_schema: {
      type: "object",
      properties: {
        negocioId: { type: "string" },
        tituloBusca: { type: "string" },
        motivo: { type: "string" },
      },
      required: ["motivo"],
    },
    sensivel: true,
    async descreverAcao(args) {
      const a = args as { negocioId?: string; tituloBusca?: string; motivo: string };
      const resolvido = await resolverPorBusca(a.negocioId, a.tituloBusca, buscarNegociosSimilarIds);
      if (!resolvido || "ambiguo" in resolvido) return "negócio não encontrado com clareza";
      const negocio = await prisma.negocio.findUnique({ where: { id: resolvido.id }, select: { titulo: true } });
      return `marcar o negócio "${negocio?.titulo ?? resolvido.id}" como perdido (motivo: ${a.motivo})`;
    },
    async executar(args) {
      const a = args as { negocioId?: string; tituloBusca?: string; motivo: string };
      const resolvido = await resolverPorBusca(a.negocioId, a.tituloBusca, buscarNegociosSimilarIds);
      if (!resolvido) throw new Error(`Não achei nenhum negócio parecido com "${a.tituloBusca}".`);
      if ("ambiguo" in resolvido) throw new Error("Achei mais de um negócio parecido — preciso do ID exato.");
      await marcarNegocioPerdido(resolvido.id, a.motivo);
      return { id: resolvido.id, perdido: true };
    },
  },
  {
    name: "buscar_tarefas",
    description: "Busca tarefas por título — busca aproximada tipo Google. Deixe termo vazio pra listar as pendentes mais próximas do prazo.",
    input_schema: {
      type: "object",
      properties: { termo: { type: "string", description: "Título da tarefa, opcional" } },
    },
    async executar(args) {
      const { termo } = args as { termo?: string };
      const include = { responsavel: true, negocio: true, contato: true } as const;
      let tarefas;
      if (termo) {
        const ids = await buscarTarefasSimilarIds(termo);
        const encontradas = await prisma.tarefa.findMany({ where: { id: { in: ids } }, include });
        tarefas = encontradas.sort((x, y) => ids.indexOf(x.id) - ids.indexOf(y.id));
      } else {
        tarefas = await prisma.tarefa.findMany({ where: { status: { not: "CONCLUIDA" } }, include, orderBy: { prazo: "asc" }, take: 10 });
      }
      return tarefas.length > 0
        ? tarefas.map((t) => ({
            id: t.id,
            titulo: t.titulo,
            prazo: t.prazo.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
            status: t.status,
            negocio: t.negocio?.titulo ?? null,
          }))
        : "Nenhuma tarefa encontrada.";
    },
  },
  {
    name: "criar_tarefa",
    description:
      "Cria uma tarefa/lembrete de trabalho, com prazo. Se o comando mencionar uma data específica (ex: 'dia 01/09 às 09:30'), use dataHora. Se for relativo (ex: 'em 3 dias'), use prazoDias.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        dataHora: { type: "string", description: "Data e hora exata no formato AAAA-MM-DDTHH:mm, ex: 2026-09-01T09:30" },
        prazoDias: { type: "integer", description: "Alternativa a dataHora — em quantos dias a partir de hoje. Padrão 1 (amanhã) se nenhum dos dois vier." },
        descricao: { type: "string" },
      },
      required: ["titulo"],
    },
    async executar(args, { usuarioId }) {
      const { titulo, dataHora, prazoDias, descricao } = args as { titulo: string; dataHora?: string; prazoDias?: number; descricao?: string };
      let prazo: Date;
      if (dataHora) {
        prazo = new Date(dataHora);
        if (isNaN(prazo.getTime())) throw new Error("Data/hora inválida.");
      } else {
        prazo = new Date();
        prazo.setDate(prazo.getDate() + (prazoDias ?? 1));
      }
      const tarefa = await criarTarefa({
        titulo,
        descricao: descricao || null,
        prazo,
        responsavelId: usuarioId,
        solicitanteId: usuarioId,
      });
      return { id: tarefa.id, titulo: tarefa.titulo, prazo: prazo.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) };
    },
  },
  {
    name: "atualizar_tarefa",
    description: "Edita título, descrição, prazo ou status de uma tarefa já existente. Informe tarefaId ou tituloBusca.",
    input_schema: {
      type: "object",
      properties: {
        tarefaId: { type: "string" },
        tituloBusca: { type: "string", description: "Título da tarefa, alternativa a tarefaId" },
        novoTitulo: { type: "string" },
        novaDescricao: { type: "string" },
        novoStatus: { type: "string", enum: ["A_FAZER", "EM_ANDAMENTO", "APROVACAO", "CONCLUIDA"] },
        novaDataHora: { type: "string", description: "Novo prazo exato, formato AAAA-MM-DDTHH:mm" },
        novoPrazoDias: { type: "integer", description: "Alternativa a novaDataHora — em quantos dias a partir de hoje" },
      },
    },
    async executar(args) {
      const a = args as {
        tarefaId?: string;
        tituloBusca?: string;
        novoTitulo?: string;
        novaDescricao?: string;
        novoStatus?: "A_FAZER" | "EM_ANDAMENTO" | "APROVACAO" | "CONCLUIDA";
        novaDataHora?: string;
        novoPrazoDias?: number;
      };
      const resolvido = await resolverPorBusca(a.tarefaId, a.tituloBusca, buscarTarefasSimilarIds);
      if (!resolvido) throw new Error(`Não achei nenhuma tarefa parecida com "${a.tituloBusca}".`);
      if ("ambiguo" in resolvido) {
        const opcoes = await prisma.tarefa.findMany({ where: { id: { in: resolvido.ids } }, select: { id: true, titulo: true, prazo: true } });
        return { ambiguo: true, opcoes: opcoes.map((o) => ({ id: o.id, titulo: o.titulo, prazo: o.prazo.toLocaleDateString("pt-BR") })) };
      }
      const atual = await prisma.tarefa.findUniqueOrThrow({ where: { id: resolvido.id } });
      let novoPrazo = atual.prazo;
      if (a.novaDataHora) {
        novoPrazo = new Date(a.novaDataHora);
        if (isNaN(novoPrazo.getTime())) throw new Error("Data/hora inválida.");
      } else if (a.novoPrazoDias != null) {
        novoPrazo = new Date();
        novoPrazo.setDate(novoPrazo.getDate() + a.novoPrazoDias);
      }
      await atualizarTarefa(resolvido.id, {
        titulo: a.novoTitulo || atual.titulo,
        negocioId: atual.negocioId,
        responsavelId: atual.responsavelId,
        prazo: novoPrazo,
        descricao: a.novaDescricao !== undefined ? a.novaDescricao : atual.descricao,
        status: a.novoStatus || atual.status,
      });
      return {
        id: resolvido.id,
        titulo: a.novoTitulo || atual.titulo,
        prazo: novoPrazo.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
        status: a.novoStatus || atual.status,
      };
    },
  },
  {
    name: "buscar_cotacoes",
    description:
      "Busca cotações de custo/margem (aba Cotações em Cadastros — calculadora interna de preço por categoria: Playground, Kidplay, Brinquedos, Outros) por título. Deixe termo vazio pra listar as mais recentes. Use antes de responder perguntas sobre preço/margem de uma cotação específica.",
    input_schema: {
      type: "object",
      properties: { termo: { type: "string", description: "Título da cotação, opcional" } },
    },
    async executar(args) {
      const { termo } = args as { termo?: string };
      const resumos = await buscarCotacoesSimilar(termo ?? "", 8);
      if (resumos.length === 0) return "Nenhuma cotação encontrada.";
      return Promise.all(
        resumos.map(async (r) => {
          const cotacao = await buscarCotacaoPorId(r.id);
          if (!cotacao) return { id: r.id, numero: r.numero, titulo: r.titulo, tipo: r.tipo };
          const resultado = calcularCotacao({
            itens: cotacao.itens.map((i) => ({ quantidade: i.quantidade, custoUnitarioCentavos: i.custoUnitarioCentavos })),
            maoDeObra: cotacao.maoDeObra as unknown as MaoDeObraItem[],
            markup: cotacao.markup,
            adicionalCentavos: cotacao.adicionalCentavos,
            instalacaoPercentual: cotacao.instalacaoPercentual,
            freteKm: cotacao.freteKm,
            fretePrecoPorKmCentavos: cotacao.fretePrecoPorKmCentavos,
            impostoCentavos: cotacao.impostoCentavos,
          });
          return {
            id: r.id,
            numero: r.numero,
            titulo: r.titulo,
            tipo: r.tipo,
            quantidade_itens: cotacao.itens.length,
            total_cobrado: centavosParaReais(resultado.totalCentavos),
            resultado: centavosParaReais(resultado.resultadoCentavos),
          };
        }),
      );
    },
  },
  {
    name: "buscar_contratos",
    description:
      "Busca contratos gerados (snapshot do texto no momento da geração, vinculado a um negócio) pelo título do negócio ou nome do cliente. Deixe termo vazio pra listar os mais recentes.",
    input_schema: {
      type: "object",
      properties: { termo: { type: "string", description: "Título do negócio ou nome do cliente, opcional" } },
    },
    async executar(args) {
      const { termo } = args as { termo?: string };
      let contratos;
      if (termo) {
        const ids = await buscarContratosSimilarIds(termo);
        const todos = await listarContratos();
        contratos = todos.filter((c) => ids.includes(c.id)).sort((x, y) => ids.indexOf(x.id) - ids.indexOf(y.id));
      } else {
        contratos = (await listarContratos()).slice(0, 8);
      }
      return contratos.length > 0
        ? contratos.map((c) => ({
            id: c.id,
            numero: c.numero,
            status: c.status,
            negocio: c.negocio.titulo,
            cliente: c.negocio.contato?.nome ?? "sem cliente",
            criadoEm: c.criadoEm.toLocaleDateString("pt-BR"),
          }))
        : "Nenhum contrato encontrado.";
    },
  },
  {
    name: "resumo_do_dia",
    description: "Dá um resumo rápido: tarefas com prazo pra hoje/atrasadas e orçamentos em rascunho ou enviados aguardando resposta.",
    input_schema: { type: "object", properties: {} },
    async executar() {
      const hoje = new Date();
      hoje.setHours(23, 59, 59, 999);
      const [tarefas, orcamentos] = await Promise.all([listTarefas(), listarOrcamentos()]);
      const tarefasPendentes = tarefas.filter((t) => t.status !== "CONCLUIDA" && t.prazo <= hoje).slice(0, 10);
      const orcamentosAbertos = orcamentos.filter((o) => o.status === "RASCUNHO" || o.status === "ENVIADO").slice(0, 10);
      return {
        tarefas_pendentes_ou_atrasadas: tarefasPendentes.map((t) => ({ titulo: t.titulo, prazo: t.prazo.toLocaleDateString("pt-BR") })),
        orcamentos_em_aberto: orcamentosAbertos.map((o) => ({ numero: o.numero, cliente: o.contato?.nome ?? "sem cliente", status: o.status })),
      };
    },
  },
];

function paraToolAnthropic(f: Ferramenta): Anthropic.Tool {
  return { name: f.name, description: f.description, input_schema: f.input_schema };
}

function montarSystemPrompt(): string {
  const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full", timeStyle: "short" });
  return `Você é o assistente de automação do CRM da Legaus Kids (fabricante de playgrounds e parques infantis). Marcos, o dono, dá comandos por voz ou texto e você executa usando as ferramentas disponíveis — você é o braço direito dele quando ele não está na frente do computador, então execute com confiança, sem burocracia desnecessária.

Agora é: ${agora} (horário de Brasília). Use isso pra calcular datas relativas ("amanhã", "em 3 dias") e pra entender datas sem ano ("dia 01/09" = 2026-09-01 se ainda não passou esse ano, senão o ano seguinte).

Regras:
- Responda sempre em português do Brasil, direto e objetivo — poucas frases, sem enrolação, como se estivesse falando com o Marcos por WhatsApp.
- A resposta pode ir pro WhatsApp de verdade — formate como WhatsApp, não como Markdown: *asterisco simples* pra negrito (nunca **duplo**), _underline_ pra itálico, sem títulos com #, sem tabelas.
- Os comandos costumam vir de um áudio transcrito, não de texto digitado com cuidado — então venha sem pontuação, com repetições, "é... tipo...", correções no meio ("não, deixa isso pra depois, na verdade quero..."), ou mais de um pedido emendado na mesma frase. Interprete a intenção real por trás da fala solta, ignore as hesitações, e priorize a versão final quando o Marcos se corrigir no meio da frase.
- Se o áudio/comando pedir várias coisas (ex: "cria uma tarefa pra ligar pro João amanhã e já muda o negócio da Apromes pra etapa de fechamento"), execute todas em sequência, uma ferramenta por vez, sem parar no meio pra perguntar "posso continuar?" — só pare de verdade nas ferramentas sensíveis, que já pedem confirmação sozinhas.
- Sempre que o comando envolver um cliente, produto, negócio, tarefa, cotação ou contrato por nome, use a ferramenta de busca correspondente primeiro (busca aproximada, tolera erro de digitação) pra achar o ID certo antes de criar ou editar algo. Antes de responder qualquer pergunta que dependa de dado do CRM (preço, orçamento, cotação, contato, contrato, negócio...), busque de verdade com a ferramenta certa em vez de responder de memória ou chutar — o Marcos pode te pedir pra cruzar informação de vários lugares (ex: "qual o preço desse produto na lista e o que tem cotado pra esse cliente") numa mesma pergunta.
- Se o resultado de uma ferramenta vier com "ambiguo": true e uma lista de "opcoes", isso significa que a busca achou mais de um resultado parecido — liste as opções pro Marcos escolher, não tente adivinhar qual ele quis dizer.
- Antes de criar ou mover um negócio, use buscar_funis_etapas pra saber os IDs certos de funil/etapa.
- Você tem acesso ao histórico recente da conversa — "esse orçamento", "ele", "o cliente que acabei de criar" etc. se referem ao que apareceu nas mensagens anteriores. Não peça pra repetir uma informação que já foi dada antes.
- Ferramentas sensíveis (enviar por WhatsApp ou e-mail, excluir orçamento, marcar negócio como perdido) nunca executam de primeira — o resultado da ferramenta vai te dizer que está pendente de confirmação. IMPORTANTE: pra propor uma ação sensível você TEM que chamar a ferramenta de verdade — nunca descreva a ação em texto puro perguntando "posso confirmar?" sem chamar a ferramenta, porque nesse caso o sistema não sabe o que confirmar depois. A chamada da ferramenta É o pedido de confirmação. Depois de chamá-la, pergunte a confirmação pro Marcos com suas próprias palavras, mencionando os detalhes principais.
- Ações de edição/criação normais (cliente, produto, preço, orçamento, negócio, tarefa) executam direto, sem pedir confirmação — só pare pra confirmar nas ferramentas marcadas como sensíveis.
- Enviar orçamento por WhatsApp ou e-mail já manda o PDF de verdade anexado, automaticamente — não precisa de um comando separado pra "mandar em PDF". Se o Marcos pedir só o link/arquivo pra ver aqui no chat mesmo (sem mandar pro cliente), use obter_link_pdf_orcamento.
- Marcar um negócio como Ganho exige que o cliente já tenha CNPJ, razão social, endereço, cidade/UF e nome+CPF do representante legal cadastrados, e que o negócio tenha forma de pagamento definida — tudo isso vira o contrato automaticamente. Se mover_negocio_etapa falhar dizendo o que falta, ajude a preencher com atualizar_cliente/atualizar_negocio antes de tentar de novo.
- Se não achar o que foi pedido (cliente, produto, orçamento, negócio, tarefa), diga isso claramente em vez de inventar.
- Quando vier um PDF anexado (cartão CNPJ, orçamento de terceiro, cotação escaneada etc.), leia o conteúdo de verdade e use os dados extraídos pra executar o que o Marcos pediu — ex: cartão CNPJ + "cadastra esse cliente" = extrair razão social, CNPJ, endereço e chamar criar_cliente/atualizar_cliente com esses dados, sem pedir pro Marcos digitar de novo o que já está no PDF. Se algum dado importante não estiver legível/presente no PDF, pergunte só esse dado específico.
- Depois de executar uma ação com sucesso, confirme o que foi feito em uma frase curta.`;
}

const JANELA_HISTORICO_MS = 30 * 60 * 1000; // conversas de mais de 30min atrás não entram como contexto
const MAX_TROCAS_HISTORICO = 6;

/** Busca as últimas trocas dessa origem pra dar memória de curto prazo ao agente — sem isso, "manda esse orçamento" não sabe qual "esse". */
async function buscarHistoricoRecente(identificador: string): Promise<Anthropic.MessageParam[]> {
  const limite = new Date(Date.now() - JANELA_HISTORICO_MS);
  const recentes = await prisma.comandoAgente.findMany({
    where: { identificador, criadoEm: { gte: limite }, resposta: { not: null } },
    orderBy: { criadoEm: "desc" },
    take: MAX_TROCAS_HISTORICO,
  });
  const mensagens: Anthropic.MessageParam[] = [];
  for (const c of recentes.reverse()) {
    mensagens.push({ role: "user", content: c.textoComando });
    mensagens.push({ role: "assistant", content: c.resposta! });
  }
  return mensagens;
}

async function rodarAgenteClaude(
  textoComando: string,
  usuarioId: string,
  identificador: string,
  anexoPdf?: { base64: string; nomeArquivo: string },
): Promise<{ texto: string; ferramentaPendente: { nome: string; args: unknown; descricao: string } | null; ferramentasChamadas: string[] }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      texto: "O agente ainda não está configurado (falta a chave da Anthropic no servidor). Avisa o Marcos.",
      ferramentaPendente: null,
      ferramentasChamadas: [],
    };
  }

  const client = new Anthropic({ apiKey });
  const historico = await buscarHistoricoRecente(identificador);
  // Com PDF anexado (cartão CNPJ, orçamento de terceiro, cotação escaneada
  // etc.), manda o documento de verdade pro Claude ler — suporte nativo a
  // PDF da API da Anthropic, sem precisar de OCR/parsing à parte.
  const conteudoUsuario: Anthropic.MessageParam["content"] = anexoPdf
    ? [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: anexoPdf.base64 } },
        { type: "text", text: textoComando },
      ]
    : textoComando;
  const messages: Anthropic.MessageParam[] = [...historico, { role: "user", content: conteudoUsuario }];
  let ferramentaPendente: { nome: string; args: unknown; descricao: string } | null = null;
  const ferramentasChamadas: string[] = [];

  // 8 turnos (não 5) porque um único áudio costuma emendar várias tarefas
  // diferentes ("cria isso, muda aquilo, e já lembra de ligar pro fulano") —
  // cada uma consome pelo menos um turno de ferramenta.
  for (let turno = 0; turno < 8; turno++) {
    const resposta = await client.messages.create({
      model: MODELO,
      max_tokens: 1024,
      system: montarSystemPrompt(),
      tools: FERRAMENTAS.map(paraToolAnthropic),
      messages,
    });

    messages.push({ role: "assistant", content: resposta.content });

    const usosDeFerramenta = resposta.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (usosDeFerramenta.length === 0) {
      const textoFinal = resposta.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { texto: textoFinal || "Feito.", ferramentaPendente, ferramentasChamadas };
    }

    const resultadosFerramenta: Anthropic.ToolResultBlockParam[] = [];
    for (const uso of usosDeFerramenta) {
      const ferramenta = FERRAMENTAS.find((f) => f.name === uso.name);
      ferramentasChamadas.push(uso.name);
      if (!ferramenta) {
        resultadosFerramenta.push({ type: "tool_result", tool_use_id: uso.id, content: "ferramenta desconhecida", is_error: true });
        continue;
      }
      const entrada = uso.input as ArgsFerramenta;
      if (ferramenta.sensivel) {
        const descricao = ferramenta.descreverAcao ? await ferramenta.descreverAcao(entrada) : ferramenta.name;
        ferramentaPendente = { nome: uso.name, args: entrada, descricao };
        resultadosFerramenta.push({
          type: "tool_result",
          tool_use_id: uso.id,
          content: `Ação NÃO executada ainda — está pendente de confirmação do usuário. Pergunte, com suas palavras, se confirma: "${descricao}". Não diga que já foi feito.`,
        });
        continue;
      }
      try {
        const resultado = await ferramenta.executar(entrada, { usuarioId });
        resultadosFerramenta.push({ type: "tool_result", tool_use_id: uso.id, content: JSON.stringify(resultado) });
      } catch (erro) {
        resultadosFerramenta.push({
          type: "tool_result",
          tool_use_id: uso.id,
          content: `Erro: ${erro instanceof Error ? erro.message : "desconhecido"}`,
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: resultadosFerramenta });
  }

  return { texto: "Não consegui concluir — o comando ficou grande demais pra resolver em uma rodada. Tenta dividir em partes.", ferramentaPendente, ferramentasChamadas };
}

function interpretarConfirmacao(texto: string): "sim" | "nao" | "ambiguo" {
  const t = texto.trim().toLowerCase();
  if (/^(sim|s|ss|confirmo|confirma(do)?|pode|manda|mandar|enviar?|isso|ok|okay|beleza|exato|é isso|isso mesmo|correto)\b/.test(t)) return "sim";
  if (/^(n[aã]o|n|cancela(r)?|para|deixa|esquece)\b/.test(t)) return "nao";
  return "ambiguo";
}

async function buscarPendenteAtivo(identificador: string) {
  const limite = new Date(Date.now() - JANELA_PENDENTE_MS);
  return prisma.comandoAgente.findFirst({
    where: { identificador, status: "AGUARDANDO_CONFIRMACAO", criadoEm: { gte: limite } },
    orderBy: { criadoEm: "desc" },
  });
}

export async function processarComandoAgente(input: {
  texto: string;
  origem: OrigemComando;
  identificador: string;
  usuarioId: string;
  anexoPdf?: { base64: string; nomeArquivo: string };
}): Promise<{ resposta: string }> {
  const pendente = await buscarPendenteAtivo(input.identificador);

  if (pendente && pendente.ferramentaPendente) {
    const decisao = interpretarConfirmacao(input.texto);
    if (decisao === "sim") {
      const ferramenta = FERRAMENTAS.find((f) => f.name === pendente.ferramentaPendente);
      let resposta: string;
      try {
        if (ferramenta) {
          await ferramenta.executar((pendente.argumentosPendentes ?? {}) as ArgsFerramenta, { usuarioId: input.usuarioId });
        }
        resposta = `Feito — ${pendente.descricaoPendente}.`;
      } catch (erro) {
        resposta = `Tentei executar mas deu erro: ${erro instanceof Error ? erro.message : "desconhecido"}`;
      }
      await prisma.comandoAgente.update({ where: { id: pendente.id }, data: { status: "CONCLUIDO" } });
      await prisma.comandoAgente.create({
        data: { origem: input.origem, identificador: input.identificador, usuarioId: input.usuarioId, textoComando: input.texto, resposta, status: "CONCLUIDO" },
      });
      return { resposta };
    }
    if (decisao === "nao") {
      const resposta = "Combinado, não fiz nada.";
      await prisma.comandoAgente.update({ where: { id: pendente.id }, data: { status: "CANCELADO" } });
      await prisma.comandoAgente.create({
        data: { origem: input.origem, identificador: input.identificador, usuarioId: input.usuarioId, textoComando: input.texto, resposta, status: "CONCLUIDO" },
      });
      return { resposta };
    }
    // ambíguo: não mexe no pendente — pode ser uma pergunta ao lado ("me manda em pdf?")
    // no meio da confirmação, e o Marcos ainda pode responder "sim" depois. O pendente só
    // expira sozinho pela janela de 10min (JANELA_PENDENTE_MS) se ninguém confirmar.
  }

  const resultado = await rodarAgenteClaude(input.texto, input.usuarioId, input.identificador, input.anexoPdf);

  await prisma.comandoAgente.create({
    data: {
      origem: input.origem,
      identificador: input.identificador,
      usuarioId: input.usuarioId,
      // Não guarda os bytes do PDF (só o nome) — o anexo só importa pro
      // turno em que foi mandado, não precisa persistir no histórico.
      textoComando: input.anexoPdf ? `${input.texto}\n[PDF anexado: ${input.anexoPdf.nomeArquivo}]` : input.texto,
      resposta: resultado.texto,
      status: resultado.ferramentaPendente ? "AGUARDANDO_CONFIRMACAO" : "CONCLUIDO",
      ferramentaPendente: resultado.ferramentaPendente?.nome,
      argumentosPendentes: resultado.ferramentaPendente ? (resultado.ferramentaPendente.args as object) : undefined,
      descricaoPendente: resultado.ferramentaPendente?.descricao,
    },
  });

  return { resposta: resultado.texto };
}

export function listarHistoricoComandos(identificador: string, limite = 30) {
  return prisma.comandoAgente.findMany({
    where: { identificador },
    orderBy: { criadoEm: "desc" },
    take: limite,
  });
}

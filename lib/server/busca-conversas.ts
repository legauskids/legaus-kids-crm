import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { mesmoTelefone, partesTelefone, soDigitosTelefone, telefoneLegivel, temNomeSalvo } from "@/lib/utils/telefone";

// Busca nas conversas do Atendimento pro agente (pedido do Marcos de
// 2026-10-16): "encontre o contato com o final 6980 e gere um negócio..." —
// o agente só sabia buscar no cadastro, e quem chega pelo WhatsApp fica com
// o telefone no lugar do nome até alguém salvar. Daqui o agente pega o
// contatoId/conversaId pra salvar o nome, criar negócio e tarefa.

export type FiltroBuscaConversas = {
  /** Número inteiro (qualquer formato) ou só o final — 4 dígitos ou mais. */
  telefone?: string;
  /** Trecho do nome do contato ou de alguma mensagem da conversa. */
  termo?: string;
  /** Só conversas com mensagem nesse intervalo. */
  inicio?: Date;
  fim?: Date;
  somenteSemNome?: boolean;
  somenteSemNegocio?: boolean;
  limite?: number;
};

const CANDIDATOS = 80;
const TEXTO_MAX = 160;
const BRASILIA = "America/Sao_Paulo";

export { temNomeSalvo };

/** A conversa existe? Devolve o contato dela (pro negócio/tarefa ficarem ligados). */
export async function conversaDoAtendimento(conversaId: string): Promise<{ id: string; contatoId: string }> {
  const conversa = await prisma.conversa.findUnique({ where: { id: conversaId }, select: { id: true, contatoId: true } });
  if (!conversa) throw new Error("Conversa não encontrada — confira o ID com buscar_conversas.");
  return conversa;
}

/**
 * Números que dão comando ao agente pelo WhatsApp (Marcos, o próprio número
 * da Legaus): essas conversas não são atendimento de cliente. Pelo menos 3
 * comandos, pra um cliente que escreveu "agente" uma vez não sumir da busca.
 */
async function numerosDeComando(): Promise<string[]> {
  const grupos = await prisma.comandoAgente.groupBy({
    by: ["identificador"],
    where: { origem: "WHATSAPP" },
    _count: { _all: true },
  });
  return grupos.filter((g) => g._count._all >= 3).map((g) => g.identificador);
}

function quando(d: Date): string {
  return d.toLocaleString("pt-BR", { timeZone: BRASILIA, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function resumoMensagem(m: { direcao: string; texto: string; enviadaEm: Date; anexoNome: string | null }) {
  const texto = (m.texto || (m.anexoNome ? `📎 ${m.anexoNome}` : "")).replace(/\s+/g, " ").trim();
  return {
    de: m.direcao === "ENTRADA" ? "cliente" : "Legaus",
    texto: texto.length > TEXTO_MAX ? `${texto.slice(0, TEXTO_MAX)}…` : texto,
    quando: quando(m.enviadaEm),
  };
}

export async function buscarConversasAtendimento(f: FiltroBuscaConversas) {
  const limite = f.limite ?? 15;
  const termo = f.termo?.trim() || undefined;
  const digitos = f.telefone ? soDigitosTelefone(f.telefone) : "";
  const partes = digitos.length >= 8 ? partesTelefone(digitos) : null;
  const final = partes ? partes.final8 : digitos.length >= 4 ? digitos : null;
  if (f.telefone && !final) throw new Error("Telefone com poucos dígitos — informe pelo menos os 4 últimos.");
  const noPeriodo = f.inicio ? { gte: f.inicio, lt: f.fim ?? new Date() } : undefined;

  const condicoes: Prisma.ConversaWhereInput[] = [];
  if (final) condicoes.push({ contato: { telefone: { endsWith: final } } });
  if (termo) {
    condicoes.push({
      OR: [
        { contato: { nome: { contains: termo, mode: "insensitive" } } },
        { contato: { razaoSocial: { contains: termo, mode: "insensitive" } } },
        { mensagens: { some: { texto: { contains: termo, mode: "insensitive" } } } },
      ],
    });
  }
  if (noPeriodo) condicoes.push({ mensagens: { some: { enviadaEm: noPeriodo } } });

  const [candidatas, comandos] = await Promise.all([
    prisma.conversa.findMany({
      where: { AND: condicoes },
      orderBy: { updatedAt: "desc" },
      take: CANDIDATOS,
      select: {
        id: true,
        status: true,
        updatedAt: true,
        setor: { select: { nome: true } },
        atendente: { select: { nome: true } },
        contato: {
          select: {
            id: true,
            nome: true,
            telefone: true,
            // Sem o filtro da extensão de lib/db.ts aqui (relação aninhada):
            // negócio excluído e já fechado ficam de fora na mão.
            negocios: {
              where: { excluidoEm: null, etapa: { tipo: "NORMAL" } },
              orderBy: { createdAt: "desc" },
              take: 5,
              select: { id: true, titulo: true, funil: { select: { nome: true } }, etapa: { select: { nome: true } } },
            },
            tarefas: {
              where: { status: { not: "CONCLUIDA" } },
              orderBy: { prazo: "asc" },
              take: 5,
              select: { id: true, titulo: true, prazo: true },
            },
          },
        },
        mensagens: {
          orderBy: { enviadaEm: "desc" },
          take: 3,
          select: { direcao: true, texto: true, enviadaEm: true, anexoNome: true },
        },
        _count: { select: { mensagens: noPeriodo ? { where: { enviadaEm: noPeriodo } } : true } },
      },
    }),
    numerosDeComando(),
  ]);

  const filtradas = candidatas
    .filter((c) => !partes || (c.contato.telefone !== null && mesmoTelefone(c.contato.telefone, digitos)))
    .filter((c) => !c.contato.telefone || !comandos.some((n) => mesmoTelefone(n, c.contato.telefone as string)))
    .filter((c) => !f.somenteSemNome || !temNomeSalvo(c.contato.nome))
    .filter((c) => !f.somenteSemNegocio || c.contato.negocios.length === 0)
    .sort((a, b) => (b.mensagens[0]?.enviadaEm ?? b.updatedAt).getTime() - (a.mensagens[0]?.enviadaEm ?? a.updatedAt).getTime());
  const mostradas = filtradas.slice(0, limite);

  // Onde o termo apareceu, pra quem lê saber por que a conversa veio.
  const trechos = new Map<string, ReturnType<typeof resumoMensagem>>();
  if (termo && mostradas.length > 0) {
    const achadas = await prisma.mensagem.findMany({
      where: { conversaId: { in: mostradas.map((c) => c.id) }, texto: { contains: termo, mode: "insensitive" } },
      orderBy: { enviadaEm: "desc" },
      distinct: ["conversaId"],
      select: { conversaId: true, direcao: true, texto: true, enviadaEm: true, anexoNome: true },
    });
    for (const m of achadas) trechos.set(m.conversaId, resumoMensagem(m));
  }

  return {
    total: filtradas.length,
    conversas: mostradas.map((c) => ({
      contatoId: c.contato.id,
      conversaId: c.id,
      nome: c.contato.nome,
      nome_salvo: temNomeSalvo(c.contato.nome),
      telefone: c.contato.telefone ? telefoneLegivel(c.contato.telefone) : null,
      setor: c.setor.nome,
      situacao: c.status === "FILA" ? "na fila" : `em atendimento${c.atendente ? ` (${c.atendente.nome})` : ""}`,
      [noPeriodo ? "mensagens_no_periodo" : "mensagens"]: c._count.mensagens,
      ultimas_mensagens: [...c.mensagens].reverse().map(resumoMensagem),
      ...(trechos.has(c.id) && { trecho_encontrado: trechos.get(c.id) }),
      negocios_abertos: c.contato.negocios.map((n) => ({ id: n.id, titulo: n.titulo, funil: n.funil.nome, etapa: n.etapa.nome })),
      tarefas_abertas: c.contato.tarefas.map((t) => ({ id: t.id, titulo: t.titulo, prazo: quando(t.prazo) })),
    })),
  };
}

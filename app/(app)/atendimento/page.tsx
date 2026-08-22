import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import {
  listConversas,
  getConversaDetalhada,
  processarMensagensAgendadasVencidas,
  type EscopoConversa,
} from "@/lib/server/conversas";
import { listRespostasRapidas } from "@/lib/server/respostas-rapidas";
import { listNegociosPorContato, listFunisComEtapas } from "@/lib/server/negocios";
import { AtendimentoShell } from "@/app/(app)/atendimento/atendimento-shell";

export default async function AtendimentoPage({
  searchParams,
}: {
  searchParams: Promise<{ conversaId?: string; escopo?: string; setor?: string }>;
}) {
  const user = await requireUser();
  const { conversaId, escopo: escopoParam, setor: setorId } = await searchParams;
  const escopo: EscopoConversa =
    escopoParam === "minhas" || escopoParam === "fila" ? escopoParam : "todas";

  await processarMensagensAgendadasVencidas();

  const [conversasRaw, setores, usuarios, respostasRapidas, funis] = await Promise.all([
    listConversas({ escopo, setorId, userId: user.id }),
    prisma.setor.findMany({ orderBy: { nome: "asc" } }),
    prisma.user.findMany({ orderBy: { nome: "asc" } }),
    listRespostasRapidas(user.id),
    listFunisComEtapas(),
  ]);

  const conversas = conversasRaw.map((c) => ({
    id: c.id,
    contatoNome: c.contato.nome,
    setorNome: c.setor.nome,
    setorId: c.setorId,
    status: c.status,
    atendenteNome: c.atendente?.nome ?? null,
    ultimaMensagem: c.mensagens[0]?.texto ?? null,
    ultimaMensagemEm: c.mensagens[0]?.enviadaEm.toISOString() ?? null,
  }));

  const conversaSelecionadaRaw = conversaId ? await getConversaDetalhada(conversaId) : null;
  const conversaSelecionada = conversaSelecionadaRaw
    ? {
        id: conversaSelecionadaRaw.id,
        status: conversaSelecionadaRaw.status,
        contatoId: conversaSelecionadaRaw.contatoId,
        contatoNome: conversaSelecionadaRaw.contato.nome,
        setorId: conversaSelecionadaRaw.setorId,
        atendenteId: conversaSelecionadaRaw.atendenteId,
        mensagens: conversaSelecionadaRaw.mensagens.map((m) => ({
          id: m.id,
          texto: m.texto,
          direcao: m.direcao,
          origem: m.origem,
          autorNome: m.autor?.nome ?? null,
          enviadaEm: m.enviadaEm.toISOString(),
        })),
        notas: conversaSelecionadaRaw.notas.map((n) => ({
          id: n.id,
          texto: n.texto,
          autorNome: n.autor.nome,
          criadaEm: n.criadaEm.toISOString(),
        })),
        agendadas: conversaSelecionadaRaw.mensagensAgendadas.map((a) => ({
          id: a.id,
          texto: a.texto,
          agendadaPara: a.agendadaPara.toISOString(),
          status: a.status,
        })),
      }
    : null;

  const negociosDoContato = conversaSelecionada
    ? (await listNegociosPorContato(conversaSelecionada.contatoId)).map((n) => ({
        id: n.id,
        titulo: n.titulo,
        funilId: n.funilId,
        funilNome: n.funil.nome,
        etapaNome: n.etapa.nome,
        valorCentavos: n.valorCentavos,
      }))
    : [];

  return (
    <AtendimentoShell
      currentUserId={user.id}
      conversas={conversas}
      conversaSelecionada={conversaSelecionada}
      escopo={escopo}
      setorFiltroId={setorId ?? null}
      setores={setores.map((s) => ({ id: s.id, nome: s.nome }))}
      usuarios={usuarios.map((u) => ({ id: u.id, nome: u.nome }))}
      respostasRapidas={respostasRapidas.map((r) => ({
        id: r.id,
        titulo: r.titulo,
        texto: r.texto,
        escopo: r.escopo,
        donoId: r.donoId,
      }))}
      funis={funis.map((f) => ({
        id: f.id,
        nome: f.nome,
        etapas: f.etapas.map((e) => ({ id: e.id, nome: e.nome })),
      }))}
      negociosDoContato={negociosDoContato}
    />
  );
}

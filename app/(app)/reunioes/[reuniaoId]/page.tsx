import { notFound } from "next/navigation";
import { requireModulo } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { getReuniao, getReuniaoAnteriorEncerrada, montarResumoReuniao } from "@/lib/server/reunioes";
import { diaBrasilia, rotuloPeriodo, sinaisDeAtencao, type ResumoReuniao } from "@/lib/utils/reuniao";
import { CabecalhoReuniao } from "@/app/(app)/reunioes/[reuniaoId]/cabecalho-reuniao";
import { PainelNumeros, SinaisAtencao } from "@/app/(app)/reunioes/[reuniaoId]/painel-numeros";
import { PautaReuniao } from "@/app/(app)/reunioes/[reuniaoId]/pauta-reuniao";
import { CompromissosReuniao, type CompromissoVM } from "@/app/(app)/reunioes/[reuniaoId]/compromissos-reuniao";
import { AtaReuniao } from "@/app/(app)/reunioes/[reuniaoId]/ata-reuniao";

function dataHoraTexto(d: Date): string {
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" });
}

function dataHoraInput(d: Date): string {
  const hora = d.toLocaleTimeString("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return `${diaBrasilia(d)}T${hora}`;
}

export default async function ReuniaoPage({ params }: { params: Promise<{ reuniaoId: string }> }) {
  const usuario = await requireModulo("reunioes");
  const { reuniaoId } = await params;
  const reuniao = await getReuniao(reuniaoId);
  if (!reuniao) notFound();

  const encerrada = reuniao.status === "ENCERRADA";
  const foto = encerrada ? (reuniao.resumoEncerramento as ResumoReuniao | null) : null;
  const agora = new Date();

  const [resumo, usuarios, anteriores, reuniaoAnterior] = await Promise.all([
    foto ?? montarResumoReuniao(reuniao),
    prisma.user.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    encerrada
      ? Promise.resolve([])
      : prisma.tarefa.findMany({
          where: { reuniaoId: { not: null, notIn: [reuniao.id] }, status: { not: "CONCLUIDA" } },
          orderBy: { prazo: "asc" },
          include: { responsavel: { select: { nome: true } }, reuniao: { select: { id: true, titulo: true } } },
        }),
    encerrada ? Promise.resolve(null) : getReuniaoAnteriorEncerrada(reuniao.data, reuniao.id),
  ]);
  // Sinais do momento da reunião: na encerrada, calculados sobre a foto (e a data do encerramento).
  const sinais = sinaisDeAtencao(resumo, foto ? new Date(resumo.geradoEm) : agora);

  const compromissos: CompromissoVM[] = reuniao.compromissos.map((t) => ({
    id: t.id,
    titulo: t.titulo,
    responsavelNome: t.responsavel.nome,
    prazo: t.prazo.toISOString(),
    concluido: t.status === "CONCLUIDA",
    atrasado: t.status !== "CONCLUIDA" && t.prazo < agora,
    reuniaoId: reuniao.id,
    reuniaoTitulo: reuniao.titulo,
  }));

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <CabecalhoReuniao
        key={`${reuniao.titulo}-${reuniao.data.toISOString()}`}
        reuniao={{
          id: reuniao.id,
          titulo: reuniao.titulo,
          tipo: reuniao.tipo,
          status: reuniao.status,
          dataHoraInput: dataHoraInput(reuniao.data),
          dataHoraTexto: dataHoraTexto(reuniao.data),
          periodoRotulo: rotuloPeriodo(reuniao.periodoInicio, reuniao.periodoFim),
          proximoRotulo: rotuloPeriodo(reuniao.proximoInicio, reuniao.proximoFim),
          pautaGeradaEm: reuniao.pautaGeradaEm?.toISOString() ?? null,
          itensPendentes: reuniao.itensPauta.filter((i) => i.status === "PENDENTE").length,
        }}
      />

      <div className="space-y-5 p-6">
        <div id="numeros" className="scroll-mt-32 space-y-5">
          <SinaisAtencao sinais={sinais} />
          <PainelNumeros
            resumo={resumo}
            fotoDoEncerramento={foto ? new Date(foto.geradoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : null}
          />
        </div>

        <PautaReuniao
          reuniaoId={reuniao.id}
          titulo={reuniao.titulo}
          dataHoraTexto={dataHoraTexto(reuniao.data)}
          encerrada={encerrada}
          usuarioAtualId={usuario.id}
          isAdmin={usuario.isAdmin}
          pautaGeradaEm={reuniao.pautaGeradaEm?.toISOString() ?? null}
          itens={reuniao.itensPauta.map((i) => ({
            id: i.id,
            titulo: i.titulo,
            descricao: i.descricao,
            origem: i.origem,
            link: i.link,
            status: i.status,
            decisao: i.decisao,
            opinioes: i.opinioes.map((o) => ({ id: o.id, autorId: o.autor.id, autorNome: o.autor.nome, texto: o.texto, criadoEm: o.criadoEm.toISOString() })),
          }))}
        />

        <CompromissosReuniao
          reuniaoId={reuniao.id}
          encerrada={encerrada}
          compromissos={compromissos}
          anteriores={anteriores.map((t) => ({
            id: t.id,
            titulo: t.titulo,
            responsavelNome: t.responsavel.nome,
            prazo: t.prazo.toISOString(),
            concluido: false,
            atrasado: t.prazo < agora,
            reuniaoId: t.reuniao?.id ?? null,
            reuniaoTitulo: t.reuniao?.titulo ?? null,
          }))}
          usuarios={usuarios}
          usuarioAtualId={usuario.id}
          prazoPadrao={diaBrasilia(new Date(reuniao.proximoFim.getTime() - 24 * 60 * 60 * 1000))}
        />

        <AtaReuniao
          key={`${reuniao.anotacoes ?? ""}-${reuniao.avaliacao ?? ""}`}
          reuniaoId={reuniao.id}
          encerrada={encerrada}
          anotacoes={reuniao.anotacoes}
          avaliacao={reuniao.avaliacao}
          avaliacaoAnterior={reuniaoAnterior?.avaliacao ? { titulo: reuniaoAnterior.titulo, texto: reuniaoAnterior.avaliacao } : null}
        />
      </div>
    </div>
  );
}

import { requireModulo } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { listConcluidos, listEmAvaliacao, listEmProducao, listInstalacoes } from "@/lib/server/producao";
import { ProducaoShell } from "@/app/(app)/producao/producao-shell";

export default async function ProducaoPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  await requireModulo("producao");
  const { aba } = await searchParams;

  const [emProducao, instalacoes, emAvaliacao, concluidos, funisComConcluido] = await Promise.all([
    listEmProducao(),
    listInstalacoes(),
    listEmAvaliacao(),
    listConcluidos(),
    prisma.etapa.findMany({ where: { tipo: "CONCLUIDO" }, select: { funilId: true } }),
  ]);
  // Só dá pra concluir negócio em andamento de funil que tem a etapa final (pós-venda).
  const temConcluido = new Set(funisComConcluido.map((e) => e.funilId));
  const podeConcluir = (n: { funilId: string; etapa: { tipo: string } }) => n.etapa.tipo === "NORMAL" && temConcluido.has(n.funilId);

  return (
    <ProducaoShell
      abaInicial={aba}
      emProducao={emProducao.map((n) => ({
        id: n.id,
        titulo: n.titulo,
        contatoNome: n.contato?.nome ?? "Sem contato",
        responsavelNome: n.responsavel.nome,
        progressoProducao: n.progressoProducao,
        previsaoProducao: n.previsaoProducao?.toISOString() ?? null,
        etapaNome: n.etapa.nome,
        podeConcluir: podeConcluir(n),
      }))}
      instalacoes={instalacoes.map((n) => ({
        id: n.id,
        titulo: n.titulo,
        contatoNome: n.contato?.nome ?? "Sem contato",
        responsavelNome: n.responsavel.nome,
        dataInstalacao: n.dataInstalacao!.toISOString(),
        equipeInstalacao: n.equipeInstalacao,
        etapaNome: n.etapa.nome,
        podeConcluir: podeConcluir(n),
        concluido: n.etapa.tipo === "CONCLUIDO",
      }))}
      emAvaliacao={emAvaliacao.map((n) => ({
        id: n.id,
        titulo: n.titulo,
        contatoNome: n.contato?.nome ?? "Sem contato",
        responsavelNome: n.responsavel.nome,
        dataInstalacao: n.dataInstalacao?.toISOString() ?? null,
        desde: n.dataEntradaNaEtapa.toISOString(),
        slaDias: n.etapa.slaDias,
      }))}
      concluidos={concluidos.map((n) => ({
        id: n.id,
        titulo: n.titulo,
        contatoNome: n.contato?.nome ?? "Sem contato",
        responsavelNome: n.responsavel.nome,
        valorCentavos: n.valorCentavos,
        dataInstalacao: n.dataInstalacao?.toISOString() ?? null,
        concluidoEm: n.dataEntradaNaEtapa.toISOString(),
      }))}
    />
  );
}

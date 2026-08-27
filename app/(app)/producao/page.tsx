import { requireModulo } from "@/lib/auth/guards";
import { listEmProducao, listInstalacoes } from "@/lib/server/producao";
import { ProducaoShell } from "@/app/(app)/producao/producao-shell";

export default async function ProducaoPage() {
  await requireModulo("producao");

  const [emProducao, instalacoes] = await Promise.all([listEmProducao(), listInstalacoes()]);

  return (
    <ProducaoShell
      emProducao={emProducao.map((n) => ({
        id: n.id,
        titulo: n.titulo,
        contatoNome: n.contato?.nome ?? "Sem contato",
        responsavelNome: n.responsavel.nome,
        progressoProducao: n.progressoProducao,
        previsaoProducao: n.previsaoProducao?.toISOString() ?? null,
      }))}
      instalacoes={instalacoes.map((n) => ({
        id: n.id,
        titulo: n.titulo,
        contatoNome: n.contato?.nome ?? "Sem contato",
        responsavelNome: n.responsavel.nome,
        dataInstalacao: n.dataInstalacao!.toISOString(),
        equipeInstalacao: n.equipeInstalacao,
      }))}
    />
  );
}

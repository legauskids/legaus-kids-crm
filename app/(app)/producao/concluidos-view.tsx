import Link from "next/link";
import { centavosParaReais } from "@/lib/utils/money";
import { formatarDataCalendario } from "@/lib/utils/dates";
import { BotaoReabrir } from "@/app/(app)/producao/botao-concluir";
import type { ConcluidoVM } from "@/app/(app)/producao/types";

function dia(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/** Projetos encerrados (etapa "Concluído" do pós-venda), mais recentes primeiro. */
export function ConcluidosView({ concluidos }: { concluidos: ConcluidoVM[] }) {
  if (concluidos.length === 0) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Nenhum projeto concluído ainda. No Painel, depois da avaliação do cliente, clique em <strong>Concluído</strong> no cartão do negócio.
      </p>
    );
  }

  const total = concluidos.reduce((soma, n) => soma + n.valorCentavos, 0);

  return (
    <div className="space-y-3 p-4">
      <p className="text-sm text-muted-foreground">
        {concluidos.length} {concluidos.length === 1 ? "projeto concluído" : "projetos concluídos"} · {centavosParaReais(total)}
      </p>
      <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-4 py-2 font-medium">Projeto</th>
              <th className="px-4 py-2 font-medium">Cliente</th>
              <th className="px-4 py-2 font-medium">Responsável</th>
              <th className="px-4 py-2 font-medium">Instalação</th>
              <th className="px-4 py-2 font-medium">Concluído em</th>
              <th className="px-4 py-2 text-right font-medium">Valor</th>
              <th className="w-24 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {concluidos.map((n) => (
              <tr key={n.id} className="border-b last:border-0 hover:bg-muted/40">
                <td className="px-4 py-2 font-medium">
                  <Link href={`/negocios/${n.id}`} className="hover:underline">
                    {n.titulo}
                  </Link>
                </td>
                <td className="px-4 py-2 text-muted-foreground">{n.contatoNome}</td>
                <td className="px-4 py-2 text-muted-foreground">{n.responsavelNome}</td>
                <td className="px-4 py-2 text-muted-foreground">{n.dataInstalacao ? formatarDataCalendario(new Date(n.dataInstalacao)) : "—"}</td>
                <td className="px-4 py-2">{dia(n.concluidoEm)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{n.valorCentavos > 0 ? centavosParaReais(n.valorCentavos) : "—"}</td>
                <td className="px-2 py-1.5 text-right">
                  <BotaoReabrir negocioId={n.id} titulo={n.titulo} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

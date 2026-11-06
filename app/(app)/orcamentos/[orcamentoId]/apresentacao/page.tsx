import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireModulo } from "@/lib/auth/guards";
import { carregarApresentacao } from "@/lib/server/apresentacao";
import { numeroOrcamento } from "@/lib/utils/apresentacao";
import { ApresentacaoEditor } from "./apresentacao-editor";

export default async function ApresentacaoOrcamentoPage({ params }: { params: Promise<{ orcamentoId: string }> }) {
  await requireModulo("orcamentos");
  const { orcamentoId } = await params;
  const dados = await carregarApresentacao(orcamentoId);
  if (!dados) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div>
        <Link href={`/orcamentos/${orcamentoId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Voltar ao orçamento
        </Link>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-foreground">Apresentação do orçamento #{numeroOrcamento(dados.orcamento.numero)}</h1>
        <p className="text-sm text-muted-foreground">
          {dados.orcamento.cliente ? `Para ${dados.orcamento.cliente}. ` : ""}No formato da apresentação da Legaus Kids, com os itens e valores do orçamento.
        </p>
      </div>
      <ApresentacaoEditor
        orcamentoId={dados.orcamentoId}
        orcamento={dados.orcamento}
        paginasIniciais={dados.paginas}
        imagensIniciais={dados.imagens}
        telefoneCliente={dados.telefoneCliente}
      />
    </div>
  );
}

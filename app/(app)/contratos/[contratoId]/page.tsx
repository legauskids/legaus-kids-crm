import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAlgumModulo } from "@/lib/auth/guards";
import { buscarContratoPorId, dadosIniciaisContrato } from "@/lib/server/contratos";
import { lerDadosContrato, EMPRESA_CONTRATO_LABEL } from "@/lib/utils/contrato";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EditorContrato } from "@/app/(app)/contratos/[contratoId]/editor-contrato";

const STATUS_LABEL = {
  RASCUNHO: "Rascunho",
  GERADO: "Gerado",
  ENVIADO: "Enviado",
  ASSINADO: "Assinado",
  CANCELADO: "Cancelado",
} as const;

export default async function ContratoPage({ params }: { params: Promise<{ contratoId: string }> }) {
  await requireAlgumModulo("negocios", "financeiro");
  const { contratoId } = await params;
  const contrato = await buscarContratoPorId(contratoId);
  if (!contrato) notFound();

  // Contrato de antes do formulário (ou gerado pelo quadro/agente sem dados):
  // o formulário vem com o que o CRM sabe do cliente e do negócio.
  const salvos = lerDadosContrato(contrato.dados);
  const iniciais = salvos ? null : await dadosIniciaisContrato(contrato.negocioId, contrato.empresaEmissora);
  const dados = salvos ?? iniciais!.dados;
  const numero = String(contrato.numero).padStart(4, "0");

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" className="shrink-0">
          <Link href={`/negocios/${contrato.negocioId}`} aria-label="Voltar ao negócio">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground">Contrato nº {numero}</h1>
            <Badge variant={contrato.status === "RASCUNHO" ? "secondary" : contrato.status === "CANCELADO" ? "destructive" : "success"}>
              {STATUS_LABEL[contrato.status]}
            </Badge>
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {dados.clienteNome || contrato.negocio.contato?.nome || "Sem cliente"} · {EMPRESA_CONTRATO_LABEL[contrato.empresaEmissora]} ·{" "}
            <Link href={`/negocios/${contrato.negocioId}`} className="underline underline-offset-2 hover:text-foreground">
              {contrato.negocio.titulo}
            </Link>
          </p>
        </div>
      </div>

      <EditorContrato
        key={`${contrato.status}-${contrato.atualizadoEm.getTime()}`}
        contratoId={contrato.id}
        numero={numero}
        status={contrato.status}
        conteudoInicial={contrato.conteudo}
        dadosIniciais={dados}
        origemProduto={iniciais?.origemProduto ?? null}
      />
    </div>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAlgumModulo } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { dadosIniciaisContrato } from "@/lib/server/contratos";
import { Button } from "@/components/ui/button";
import { NovoContrato } from "@/app/(app)/contratos/novo/novo-contrato";

// "Gerar contrato" manual (aba Contratos do Financeiro ou tela do negócio):
// pede os dados antes de gerar o rascunho.
export default async function NovoContratoPage({ searchParams }: { searchParams: Promise<{ negocio?: string; voltar?: string }> }) {
  await requireAlgumModulo("negocios", "financeiro");
  const { negocio: negocioId, voltar } = await searchParams;
  if (!negocioId) notFound();
  const negocio = await prisma.negocio.findUnique({ where: { id: negocioId }, select: { id: true, titulo: true } });
  if (!negocio) notFound();
  const { dados, origemProduto } = await dadosIniciaisContrato(negocio.id);
  const voltarPara = voltar === "financeiro" ? "/financeiro?aba=contratos" : `/negocios/${negocio.id}`;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" className="shrink-0">
          <Link href={voltarPara} aria-label="Voltar">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-foreground">Novo contrato</h1>
          <p className="truncate text-sm text-muted-foreground">
            {negocio.titulo} — confira os dados; depois dá pra mexer no texto antes do PDF final.
          </p>
        </div>
      </div>
      <NovoContrato negocioId={negocio.id} inicial={dados} origemProduto={origemProduto} />
    </div>
  );
}

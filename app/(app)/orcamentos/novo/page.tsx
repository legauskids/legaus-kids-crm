import { requireModulo } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { OrcamentoEditor } from "@/app/(app)/orcamentos/orcamento-editor";

export default async function NovoOrcamentoPage() {
  await requireModulo("orcamentos");

  const [contatos, produtos] = await Promise.all([
    prisma.contato.findMany({
      select: { id: true, nome: true, empresa: true, razaoSocial: true },
      orderBy: { nome: "asc" },
    }),
    prisma.produto.findMany({
      where: { ativo: true },
      select: { id: true, nome: true, codigo: true, categoria: true, descricao: true, imagemUrl: true, valorCentavos: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-xl font-bold tracking-tight text-foreground">Novo orçamento</h1>
      <OrcamentoEditor contatos={contatos} produtos={produtos} />
    </div>
  );
}

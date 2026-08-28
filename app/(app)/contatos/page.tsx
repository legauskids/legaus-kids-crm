import { requireModulo } from "@/lib/auth/guards";
import { listarContatosParaPainel } from "@/lib/server/contatos";
import { ContatosShell } from "@/app/(app)/contatos/contatos-shell";

export default async function ContatosPage() {
  await requireModulo("contatos");
  const contatos = await listarContatosParaPainel();

  return (
    <ContatosShell
      contatos={contatos.map((c) => ({
        id: c.id,
        nome: c.nome,
        empresa: c.empresa,
        telefone: c.telefone,
        tags: c.tags,
        negociosCount: c._count.negocios,
        conversasCount: c._count.conversas,
      }))}
    />
  );
}

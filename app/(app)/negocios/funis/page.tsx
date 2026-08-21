import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { listFunisComEtapas } from "@/lib/server/negocios";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { FunisEditor } from "@/app/(app)/negocios/funis/funis-editor";

export default async function FunisPage() {
  await requireUser();
  const funis = await listFunisComEtapas();

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/negocios">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Editar funis e etapas</h1>
      </div>
      <FunisEditor
        funis={funis.map((f) => ({
          id: f.id,
          nome: f.nome,
          etapas: f.etapas.map((e) => ({ id: e.id, nome: e.nome, ordem: e.ordem, slaDias: e.slaDias, tipo: e.tipo })),
        }))}
      />
    </div>
  );
}

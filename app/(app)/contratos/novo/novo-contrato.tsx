"use client";

import { useRouter } from "next/navigation";
import { FormularioContrato } from "@/app/(app)/contratos/formulario-contrato";
import { criarContratoAction } from "@/app/(app)/contratos/actions";
import type { DadosContrato } from "@/lib/utils/contrato";

export function NovoContrato({ negocioId, inicial, origemProduto }: { negocioId: string; inicial: DadosContrato; origemProduto: string | null }) {
  const router = useRouter();
  return (
    <FormularioContrato
      inicial={inicial}
      origemProduto={origemProduto}
      textoBotao="Gerar o rascunho do contrato"
      onEnviar={async (dados) => {
        const r = await criarContratoAction(negocioId, dados);
        if ("error" in r) return r;
        router.push(`/contratos/${r.contratoId}`);
      }}
    />
  );
}

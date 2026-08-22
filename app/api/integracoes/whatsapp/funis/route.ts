import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-token";
import { listFunisComEtapas } from "@/lib/server/negocios";

export async function GET(request: Request) {
  try {
    await requireApiUser(request);
  } catch (unauthorized) {
    return unauthorized as Response;
  }

  const funis = await listFunisComEtapas();
  return NextResponse.json({
    funis: funis.map((funil) => ({
      id: funil.id,
      nome: funil.nome,
      etapaInicialId: funil.etapas.find((etapa) => etapa.tipo === "NORMAL")?.id ?? funil.etapas[0]?.id ?? null,
    })),
  });
}

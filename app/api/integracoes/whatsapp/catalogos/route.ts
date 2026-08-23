import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-token";
import { listCatalogos } from "@/lib/server/catalogos";

export async function GET(request: Request) {
  try {
    await requireApiUser(request);
  } catch (unauthorized) {
    return unauthorized as Response;
  }

  const catalogos = await listCatalogos();
  return NextResponse.json({
    catalogos: catalogos.map((c) => ({ id: c.id, nome: c.nome, url: c.url })),
  });
}

import { requireApiUser } from "@/lib/auth/api-token";
import { listTodosContatosParaExportar } from "@/lib/server/contatos";

function escaparCsv(valor: string): string {
  if (/[",\n]/.test(valor)) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

export async function GET(request: Request) {
  try {
    await requireApiUser(request);
  } catch (unauthorized) {
    return unauthorized as Response;
  }

  const contatos = await listTodosContatosParaExportar();
  const linhas = [
    ["nome", "telefone", "empresa", "tags"].join(","),
    ...contatos.map((c) =>
      [c.nome, c.telefone, c.empresa ?? "", c.tags.join(";")].map(escaparCsv).join(","),
    ),
  ];
  const csv = linhas.join("\n");

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="contatos-legaus-kids.csv"',
    },
  });
}

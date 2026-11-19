import "server-only";
import { buscarClientesPorFinalTelefone, buscarClientesPorTelefone, buscarClientesSimilar } from "@/lib/server/busca-similar";
import { telefoneLegivel } from "@/lib/utils/telefone";
import { tipoBuscaDestinatario, type DestinatarioEnvio } from "@/lib/utils/destinatario";

/** Contatos com telefone pelo nome, pelo final do telefone ("6980") ou pelo número inteiro. */
export async function buscarDestinatarios(termo: string): Promise<DestinatarioEnvio[]> {
  const busca = tipoBuscaDestinatario(termo);
  if (!busca) return [];
  const achados =
    busca.tipo === "telefone"
      ? await buscarClientesPorTelefone(termo, 8)
      : busca.tipo === "final"
        ? await buscarClientesPorFinalTelefone(busca.digitos, 8)
        : await buscarClientesSimilar(termo.trim(), 12);
  return achados
    .filter((c): c is typeof c & { telefone: string } => Boolean(c.telefone))
    .slice(0, 6)
    .map((c) => ({ contatoId: c.id, nome: c.nome, telefone: c.telefone, telefoneFormatado: telefoneLegivel(c.telefone) }));
}

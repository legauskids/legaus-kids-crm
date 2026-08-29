import { requireModulo } from "@/lib/auth/guards";
import { listarHistoricoComandos } from "@/lib/server/agente";
import { AgenteShell, type MensagemAgenteVM } from "@/app/(app)/agente/agente-shell";

export default async function AgentePage() {
  const user = await requireModulo("agente");
  const historico = await listarHistoricoComandos(`crm:${user.id}`, 40);

  const mensagens: MensagemAgenteVM[] = historico
    .slice()
    .reverse()
    .map((h) => ({
      id: h.id,
      textoComando: h.textoComando,
      resposta: h.resposta,
      status: h.status,
      criadoEm: h.criadoEm.toISOString(),
    }));

  return <AgenteShell historicoInicial={mensagens} />;
}

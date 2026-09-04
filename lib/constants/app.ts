// URL pública do CRM — usada pra montar links compartilháveis (orçamento
// público enviado por WhatsApp/e-mail). Fixo porque essas mensagens só fazem
// sentido apontando pro domínio real de produção.
export const URL_BASE = "https://crm.legauskids.com.br";

// Telefones (só dígitos, com DDI) que recebem a notificação automática de
// lead novo (ver notificarNovoLead em lib/server/agente-atendimento.ts) —
// mesmos números autorizados a dar comando pro agente pelo WhatsApp
// (whatsapp-service/.env, WHATSAPP_COMANDO_TELEFONES). Configurável por env
// var (WHATSAPP_NOTIFICAR_TELEFONES, separado por vírgula) pra poder incluir
// a Dani sem precisar mexer em código; cai pro número do Marcos se a env var
// não estiver setada.
export const WHATSAPP_NOTIFICAR_TELEFONES = (process.env.WHATSAPP_NOTIFICAR_TELEFONES || "5555999603257")
  .split(",")
  .map((t) => t.trim())
  .filter(Boolean);

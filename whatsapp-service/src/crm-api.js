// Fala com o mesmo backend que a extensão de Chrome já usa
// (app/api/integracoes/whatsapp/*) — mesmo contrato, mesmo token de
// autenticação (Authorization: Bearer <CRM_API_TOKEN>, ver
// lib/auth/api-token.ts no CRM). Nenhuma rota nova foi criada pra esse
// serviço: ele só substitui quem fala com essas rotas (antes era
// extension/background.js).

const CRM_API_URL = process.env.CRM_API_URL || "https://crm.legauskids.com.br";
const CRM_API_TOKEN = process.env.CRM_API_TOKEN || "";

if (!CRM_API_TOKEN) {
  console.error("[crm-api] CRM_API_TOKEN não configurado — copie o token gerado em /extensao no CRM pro .env.");
  process.exit(1);
}

export async function chamarApi(caminho, options = {}) {
  const resposta = await fetch(`${CRM_API_URL}${caminho}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CRM_API_TOKEN}`,
      ...options.headers,
    },
  });

  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    throw new Error(dados?.error || `Erro HTTP ${resposta.status} em ${caminho}`);
  }
  return dados;
}

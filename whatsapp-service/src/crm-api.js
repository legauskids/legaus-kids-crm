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

/**
 * "fetch failed" (falha de rede, não HTTP — ex: TypeError do fetch) visto
 * ao vivo em 2026-09-06/08 acontecendo em sequência, minutos seguidos, num
 * processo que já estava rodando há um tempo — enquanto um processo Node
 * novo, na mesma hora, conectava na primeira tentativa. Tudo indica uma
 * conexão HTTP reaproveitada (keep-alive) que morreu sem avisar o pool do
 * Node — só descobria na próxima tentativa de usar ela. Uma única
 * retentativa (com uma pausa curta) resolve isso sem precisar reiniciar o
 * processo inteiro só por causa de uma conexão específica ruim.
 */
async function fetchComRetry(url, options) {
  try {
    return await fetch(url, options);
  } catch (erro) {
    console.warn(`[crm-api] Falha de rede (${erro.message}) — tentando de novo em 1s...`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return fetch(url, options);
  }
}

export async function chamarApi(caminho, options = {}) {
  const resposta = await fetchComRetry(`${CRM_API_URL}${caminho}`, {
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

/** Baixa um arquivo binário (ex: PDF gerado pelo CRM) com o mesmo Bearer token — sem parsear como JSON. */
export async function baixarArquivo(url) {
  const resposta = await fetchComRetry(url, { headers: { Authorization: `Bearer ${CRM_API_TOKEN}` } });
  if (!resposta.ok) {
    throw new Error(`Erro HTTP ${resposta.status} ao baixar ${url}`);
  }
  const arrayBuffer = await resposta.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

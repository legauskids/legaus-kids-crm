// Fala com o mesmo backend que a extensão de Chrome já usa
// (app/api/integracoes/whatsapp/*) — mesmo contrato, mesmo token de
// autenticação (Authorization: Bearer <CRM_API_TOKEN>, ver
// lib/auth/api-token.ts no CRM). Nenhuma rota nova foi criada pra esse
// serviço: ele só substitui quem fala com essas rotas (antes era
// extension/background.js).

import { Agent, setGlobalDispatcher } from "undici";

const CRM_API_URL = process.env.CRM_API_URL || "https://crm.legauskids.com.br";
const CRM_API_TOKEN = process.env.CRM_API_TOKEN || "";

if (!CRM_API_TOKEN) {
  console.error("[crm-api] CRM_API_TOKEN não configurado — copie o token gerado em /extensao no CRM pro .env.");
  process.exit(1);
}

// "fetch failed" (falha de rede, não erro HTTP) visto ao vivo em
// 2026-09-06/08 acontecendo em sequência, minutos seguidos, num processo
// que já estava rodando há um tempo — enquanto um processo Node novo, na
// mesma hora, conectava na primeira tentativa. Indício forte de uma
// conexão HTTP mantida viva (keep-alive) pelo pool do undici que morreu
// silenciosamente (a rede/proxy no meio do caminho derrubou uma conexão
// ociosa sem avisar o cliente) e só falhava na próxima tentativa de
// reusá-la. keepAliveTimeout curto (bem menor que o intervalo de 5s do
// relay-saida) faz o undici descartar a conexão ociosa e abrir uma nova
// antes dela ter chance de ficar velha o bastante pra isso acontecer.
setGlobalDispatcher(new Agent({ keepAliveTimeout: 3000, keepAliveMaxTimeout: 3000 }));

/**
 * Visto ao vivo em 2026-09-10: confirmar-envio devolveu 500 (blip
 * transitório do lado do CRM/banco, não reproduziu de novo) UMA vez só —
 * mas como não havia retentativa pra erro HTTP (só pra falha de rede), a
 * mensagem ficou com externalId nunca confirmado, a reserva de 90s
 * (JANELA_TENTATIVA_ENVIO_MS) expirou, e o relay-saida reenviou a MESMA
 * mensagem de verdade pro destinatário. Retentativa aqui — cobrindo 5xx
 * além de falha de rede — fecha essa janela: um blip de 1 requisição some
 * antes mesmo da mensagem virar candidata a reenvio.
 */
async function fetchComRetry(url, options, tentativas = 3) {
  let ultimoErro;
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      const resposta = await fetch(url, options);
      if (resposta.status >= 500 && tentativa < tentativas) {
        console.warn(`[crm-api] HTTP ${resposta.status} (tentativa ${tentativa}/${tentativas}) — tentando de novo em ${tentativa}s...`);
        await new Promise((resolve) => setTimeout(resolve, tentativa * 1000));
        continue;
      }
      return resposta;
    } catch (erro) {
      ultimoErro = erro;
      if (tentativa < tentativas) {
        console.warn(`[crm-api] Falha de rede (${erro.message}) (tentativa ${tentativa}/${tentativas}) — tentando de novo em ${tentativa}s...`);
        await new Promise((resolve) => setTimeout(resolve, tentativa * 1000));
      }
    }
  }
  throw ultimoErro;
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

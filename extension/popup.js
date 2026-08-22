const apiUrlInput = document.getElementById("apiUrl");
const apiTokenInput = document.getElementById("apiToken");
const statusEl = document.getElementById("status");

async function carregar() {
  const { apiUrl, apiToken } = await chrome.storage.local.get(["apiUrl", "apiToken"]);
  apiUrlInput.value = apiUrl || "http://localhost:3000";
  apiTokenInput.value = apiToken || "";
}

async function salvarETestar() {
  const apiUrl = apiUrlInput.value.trim().replace(/\/$/, "");
  const apiToken = apiTokenInput.value.trim();
  await chrome.storage.local.set({ apiUrl, apiToken });

  statusEl.textContent = "Testando...";
  statusEl.className = "";
  try {
    const resposta = await fetch(`${apiUrl}/api/integracoes/whatsapp/fila-envio`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    if (resposta.ok) {
      statusEl.textContent = "Conectado com sucesso.";
      statusEl.className = "ok";
    } else if (resposta.status === 401) {
      statusEl.textContent = "Token inválido.";
      statusEl.className = "erro";
    } else {
      statusEl.textContent = `Erro (HTTP ${resposta.status}).`;
      statusEl.className = "erro";
    }
  } catch {
    statusEl.textContent = "Não consegui conectar nessa URL.";
    statusEl.className = "erro";
  }
}

document.getElementById("salvar").addEventListener("click", salvarETestar);
carregar();

// Painel lateral recolhível injetado ao lado do WhatsApp Web (estilo Agendor):
// salvar o contato da conversa aberta no CRM e criar negócio direto por ali.
// Depende de LEGAUS_SELECTORS/primeiroElemento (selectors.js) e de
// telefoneDaConversaAtual/cabecalhoAtualTexto/log (content-script.js) —
// mesmo "isolated world", scripts carregados em sequência no manifest.

let legausFunisCache = null;
let legausPainelAberto = true;

async function legausConfiguracaoSalva() {
  const { apiUrl } = await chrome.storage.local.get(["apiUrl"]);
  return { apiUrl: apiUrl || "https://crm.legauskids.com.br" };
}

/**
 * O content script não pode fazer fetch direto pra fora de web.whatsapp.com
 * (o CSP da própria página bloqueia "Failed to fetch"), então repassa pro
 * service worker (background.js), que não tem essa restrição.
 */
async function legausChamarApi(caminho, options = {}) {
  const resultado = await chrome.runtime.sendMessage({ type: "LEGAUS_API_CALL", caminho, options });
  if (!resultado?.ok) {
    throw new Error(resultado?.dados?.error || `Erro HTTP ${resultado?.status ?? 0}`);
  }
  return resultado.dados;
}

function legausCriarPainel() {
  if (document.getElementById("legaus-sidepanel")) return;

  const painel = document.createElement("div");
  painel.id = "legaus-sidepanel";
  painel.innerHTML = `
    <button id="legaus-toggle" title="Legaus Kids CRM">CRM</button>
    <div id="legaus-sidepanel-conteudo">
      <h2>Legaus Kids CRM</h2>
      <div id="legaus-sem-conversa">Abra uma conversa para ver as opções do CRM.</div>
      <div id="legaus-com-conversa" style="display:none">
        <div id="legaus-contato-nome"></div>
        <div id="legaus-contato-telefone"></div>

        <button id="legaus-salvar-contato">Salvar contato no CRM</button>
        <div id="legaus-status-contato" class="legaus-status"></div>

        <hr />

        <button id="legaus-toggle-negocio">+ Criar negócio</button>
        <form id="legaus-form-negocio" style="display:none">
          <label>Título</label>
          <input id="legaus-negocio-titulo" type="text" />
          <label>Funil</label>
          <select id="legaus-negocio-funil"></select>
          <label>Valor (R$)</label>
          <input id="legaus-negocio-valor" type="number" step="0.01" min="0" placeholder="0,00" />
          <button type="submit">Criar negócio</button>
        </form>
        <div id="legaus-status-negocio" class="legaus-status"></div>
      </div>
    </div>
  `;
  document.body.appendChild(painel);

  document.getElementById("legaus-toggle").addEventListener("click", legausAlternarPainel);
  document.getElementById("legaus-salvar-contato").addEventListener("click", legausSalvarContato);
  document.getElementById("legaus-toggle-negocio").addEventListener("click", () => {
    const form = document.getElementById("legaus-form-negocio");
    form.style.display = form.style.display === "none" ? "flex" : "none";
  });
  document.getElementById("legaus-form-negocio").addEventListener("submit", legausCriarNegocio);

  chrome.storage.local.get(["legausPainelAberto"], ({ legausPainelAberto: salvo }) => {
    legausAplicarEstadoPainel(salvo !== false);
  });

  legausCarregarFunis();
}

function legausAplicarEstadoPainel(aberto) {
  legausPainelAberto = aberto;
  document.getElementById("legaus-sidepanel")?.classList.toggle("legaus-aberto", aberto);
}

function legausAlternarPainel() {
  const novoEstado = !legausPainelAberto;
  legausAplicarEstadoPainel(novoEstado);
  chrome.storage.local.set({ legausPainelAberto: novoEstado });
}

async function legausCarregarFunis() {
  try {
    const dados = await legausChamarApi("/api/integracoes/whatsapp/funis");
    legausFunisCache = dados.funis;
    const select = document.getElementById("legaus-negocio-funil");
    if (select) {
      select.innerHTML = legausFunisCache.map((f) => `<option value="${f.id}">${f.nome}</option>`).join("");
    }
  } catch (erro) {
    log("Falha ao carregar funis no painel:", erro.message);
  }
}

let legausUltimoTelefonePainel = null;

async function legausAtualizarConversaNoPainel() {
  if (!document.getElementById("legaus-sidepanel")) return;

  const semConversa = document.getElementById("legaus-sem-conversa");
  const comConversa = document.getElementById("legaus-com-conversa");
  const telefone = await telefoneDaConversaAtual();

  if (!telefone) {
    semConversa.style.display = "block";
    comConversa.style.display = "none";
    legausUltimoTelefonePainel = null;
    return;
  }

  if (telefone === legausUltimoTelefonePainel) return;
  legausUltimoTelefonePainel = telefone;

  semConversa.style.display = "none";
  comConversa.style.display = "block";

  const nome = (cabecalhoAtualTexto || telefone).trim();
  document.getElementById("legaus-contato-nome").textContent = nome;
  document.getElementById("legaus-contato-telefone").textContent = telefone;
  document.getElementById("legaus-negocio-titulo").value = nome;
  document.getElementById("legaus-status-contato").textContent = "";
  document.getElementById("legaus-status-negocio").textContent = "";
  document.getElementById("legaus-form-negocio").style.display = "none";
}

async function legausSalvarContato() {
  const status = document.getElementById("legaus-status-contato");
  const telefone = await telefoneDaConversaAtual();
  if (!telefone) return;

  status.textContent = "Salvando...";
  status.className = "legaus-status";
  try {
    await legausChamarApi("/api/integracoes/whatsapp/contatos", {
      method: "POST",
      body: JSON.stringify({ telefone, nome: cabecalhoAtualTexto }),
    });
    status.textContent = "Contato salvo.";
    status.className = "legaus-status legaus-status-ok";
  } catch (erro) {
    status.textContent = erro.message;
    status.className = "legaus-status legaus-status-erro";
  }
}

async function legausCriarNegocio(evento) {
  evento.preventDefault();
  const status = document.getElementById("legaus-status-negocio");
  const telefone = await telefoneDaConversaAtual();
  if (!telefone) return;

  const titulo = document.getElementById("legaus-negocio-titulo").value.trim();
  const funilId = document.getElementById("legaus-negocio-funil").value;
  const valor = document.getElementById("legaus-negocio-valor").value;

  if (!titulo || !funilId) {
    status.textContent = "Preencha título e funil.";
    status.className = "legaus-status legaus-status-erro";
    return;
  }

  status.textContent = "Criando...";
  status.className = "legaus-status";
  try {
    const { apiUrl } = await legausConfiguracaoSalva();
    const resultado = await legausChamarApi("/api/integracoes/whatsapp/negocios", {
      method: "POST",
      body: JSON.stringify({
        telefone,
        nomeContato: cabecalhoAtualTexto,
        titulo,
        funilId,
        valorReais: valor ? Number(valor) : 0,
      }),
    });
    status.innerHTML = `Negócio criado. <a href="${apiUrl}/negocios/${resultado.negocioId}" target="_blank" rel="noopener">Abrir no CRM</a>`;
    status.className = "legaus-status legaus-status-ok";
  } catch (erro) {
    status.textContent = erro.message;
    status.className = "legaus-status legaus-status-erro";
  }
}

function legausIniciarQuandoLogado() {
  if (!primeiroElemento(LEGAUS_SELECTORS.appLogado)) {
    setTimeout(legausIniciarQuandoLogado, 3000);
    return;
  }
  legausCriarPainel();
  legausAtualizarConversaNoPainel();
  setInterval(legausAtualizarConversaNoPainel, 2000);
}

legausIniciarQuandoLogado();

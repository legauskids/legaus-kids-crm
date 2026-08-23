// Painel lateral recolhível injetado ao lado do WhatsApp Web (fluxo inspirado
// no Agendor): identifica o contato da conversa aberta, oferece salvar no CRM
// e, a partir daí, criar/ver negócios vinculados como cards.
// Depende de LEGAUS_SELECTORS/primeiroElemento (selectors.js) e de
// telefoneDaConversaAtual/cabecalhoAtualTexto/log (content-script.js) —
// mesmo "isolated world", scripts carregados em sequência no manifest.

let legausFunisCache = null;
let legausPainelAberto = true;
let legausUltimoTelefonePainel = null;
let legausNegociosCache = [];

async function legausConfiguracaoSalva() {
  const { apiUrl } = await chrome.storage.local.get(["apiUrl"]);
  return { apiUrl: apiUrl || "https://crm.legauskids.com.br" };
}

/**
 * O content script não pode fazer fetch direto pra fora de web.whatsapp.com
 * (o CSP da própria página bloqueia, dá "Failed to fetch"), então repassa
 * pro service worker (background.js), que não tem essa restrição.
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
      <div class="legaus-header">Legaus Kids CRM</div>
      <div id="legaus-sem-conversa">Abra uma conversa para ver as opções do CRM.</div>

      <div id="legaus-com-conversa" style="display:none">
        <!-- Tela 1: contato ainda não salvo no CRM -->
        <div id="legaus-tela-novo" class="legaus-tela">
          <div class="legaus-contato-card">
            <div>
              <div class="legaus-contato-nome" id="legaus-nome-novo"></div>
              <div class="legaus-contato-telefone" id="legaus-telefone-novo"></div>
            </div>
            <span class="legaus-badge-novo">NOVO</span>
          </div>
          <button id="legaus-salvar-contato" class="legaus-btn-primario">Salvar contato no CRM</button>
          <div id="legaus-status-contato" class="legaus-status"></div>
        </div>

        <!-- Tela 2: contato já salvo — resumo + ações rápidas -->
        <div id="legaus-tela-resumo" class="legaus-tela" style="display:none">
          <div class="legaus-contato-card">
            <div>
              <div class="legaus-contato-nome" id="legaus-nome-resumo"></div>
              <div class="legaus-contato-telefone" id="legaus-telefone-resumo"></div>
            </div>
          </div>
          <div class="legaus-secao-titulo">Ações rápidas</div>
          <button id="legaus-ir-negocios" class="legaus-card-acao">
            <span>
              <span class="legaus-card-acao-titulo">Negócios</span>
              <span class="legaus-card-acao-sub" id="legaus-negocios-resumo">Criar e gerenciar negócios desse contato</span>
            </span>
            <span class="legaus-card-acao-seta">›</span>
          </button>
        </div>

        <!-- Tela 3: negócios do contato (lista de cards + criar) -->
        <div id="legaus-tela-negocios" class="legaus-tela" style="display:none">
          <button id="legaus-voltar-negocios" class="legaus-breadcrumb">‹ Voltar</button>
          <div id="legaus-lista-negocios"></div>
          <button id="legaus-toggle-form-negocio" class="legaus-btn-secundario">+ Novo negócio</button>
          <form id="legaus-form-negocio" style="display:none">
            <label>Título</label>
            <input id="legaus-negocio-titulo" type="text" />
            <label>Funil</label>
            <select id="legaus-negocio-funil"></select>
            <label>Valor (R$)</label>
            <input id="legaus-negocio-valor" type="number" step="0.01" min="0" placeholder="0,00" />
            <div class="legaus-form-botoes">
              <button type="button" id="legaus-cancelar-negocio">Cancelar</button>
              <button type="submit" class="legaus-btn-primario">Salvar</button>
            </div>
          </form>
          <div id="legaus-status-negocio" class="legaus-status"></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(painel);

  document.getElementById("legaus-toggle").addEventListener("click", legausAlternarPainel);
  document.getElementById("legaus-salvar-contato").addEventListener("click", legausSalvarContato);
  document.getElementById("legaus-ir-negocios").addEventListener("click", () => legausMostrarTela("negocios"));
  document.getElementById("legaus-voltar-negocios").addEventListener("click", () => legausMostrarTela("resumo"));
  document.getElementById("legaus-toggle-form-negocio").addEventListener("click", () => legausAlternarFormNegocio(true));
  document.getElementById("legaus-cancelar-negocio").addEventListener("click", () => legausAlternarFormNegocio(false));
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

function legausMostrarTela(nome) {
  for (const id of ["novo", "resumo", "negocios"]) {
    const tela = document.getElementById(`legaus-tela-${id}`);
    if (tela) tela.style.display = id === nome ? "block" : "none";
  }
}

function legausAlternarFormNegocio(mostrar) {
  const form = document.getElementById("legaus-form-negocio");
  form.style.display = mostrar ? "flex" : "none";
  document.getElementById("legaus-status-negocio").textContent = "";
  if (mostrar) {
    const telefone = legausUltimoTelefonePainel;
    document.getElementById("legaus-negocio-titulo").value = (cabecalhoAtualTexto || telefone || "").trim();
  }
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

function legausRenderizarNegocios(negocios) {
  legausNegociosCache = negocios;
  const lista = document.getElementById("legaus-lista-negocios");
  if (negocios.length === 0) {
    lista.innerHTML = `<div class="legaus-sem-negocios">Nenhum negócio ainda.</div>`;
    return;
  }
  lista.innerHTML = negocios
    .map(
      (n) => `
      <div class="legaus-negocio-card" data-negocio-id="${n.id}">
        <div class="legaus-negocio-titulo">${n.titulo}</div>
        <div class="legaus-negocio-valor">${legausFormatarReais(n.valorCentavos)}</div>
        <div class="legaus-negocio-etapa">${n.funil} · ${n.etapa}</div>
      </div>`,
    )
    .join("");
  lista.querySelectorAll(".legaus-negocio-card").forEach((card) => {
    card.addEventListener("click", async () => {
      const { apiUrl } = await legausConfiguracaoSalva();
      window.open(`${apiUrl}/negocios/${card.dataset.negocioId}`, "_blank", "noopener");
    });
  });
}

function legausFormatarReais(centavos) {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function legausAtualizarResumoNegocios() {
  const resumo = document.getElementById("legaus-negocios-resumo");
  if (!resumo) return;
  resumo.textContent =
    legausNegociosCache.length === 0
      ? "Criar e gerenciar negócios desse contato"
      : `${legausNegociosCache.length} negócio${legausNegociosCache.length > 1 ? "s" : ""} vinculado${legausNegociosCache.length > 1 ? "s" : ""}`;
}

async function legausBuscarContato(telefone) {
  try {
    return await legausChamarApi(`/api/integracoes/whatsapp/contatos?telefone=${encodeURIComponent(telefone)}`);
  } catch (erro) {
    log("Falha ao buscar contato no painel:", erro.message);
    return null;
  }
}

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
  const info = await legausBuscarContato(telefone);

  if (!info?.existe) {
    document.getElementById("legaus-nome-novo").textContent = nome;
    document.getElementById("legaus-telefone-novo").textContent = telefone;
    document.getElementById("legaus-status-contato").textContent = "";
    legausMostrarTela("novo");
    return;
  }

  document.getElementById("legaus-nome-resumo").textContent = info.contato.nome;
  document.getElementById("legaus-telefone-resumo").textContent = info.contato.telefone;
  legausRenderizarNegocios(info.negocios);
  legausAtualizarResumoNegocios();
  document.getElementById("legaus-status-negocio").textContent = "";
  legausAlternarFormNegocio(false);
  legausMostrarTela("resumo");
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
    legausUltimoTelefonePainel = null; // força reconsulta pra pegar o contato recém-criado
    await legausAtualizarConversaNoPainel();
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
    await legausChamarApi("/api/integracoes/whatsapp/negocios", {
      method: "POST",
      body: JSON.stringify({
        telefone,
        nomeContato: cabecalhoAtualTexto,
        titulo,
        funilId,
        valorReais: valor ? Number(valor) : 0,
      }),
    });
    document.getElementById("legaus-negocio-valor").value = "";
    legausAlternarFormNegocio(false);
    legausUltimoTelefonePainel = null; // força reconsulta pra pegar o negócio recém-criado
    await legausAtualizarConversaNoPainel();
    legausMostrarTela("negocios");
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

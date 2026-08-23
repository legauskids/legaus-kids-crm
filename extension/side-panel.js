// Painel lateral recolhível injetado ao lado do WhatsApp Web (fluxo inspirado
// no Agendor, funcionalidades inspiradas no Waseller): identifica o contato
// da conversa aberta, salva no CRM, cria/vê negócios, notas, lembretes,
// respostas rápidas, etiquetas e ferramentas soltas (agenda, envio em massa,
// exportar contatos, borrar mensagens).
// Depende de LEGAUS_SELECTORS/primeiroElemento (selectors.js) e de
// telefoneDaConversaAtual/nomeDaConversaAtual/digitarNaCaixaDeComposicao/
// enviarMensagemReal/log (content-script.js) — mesmo "isolated world",
// scripts carregados em sequência no manifest.
//
// NOTA (2026-08-23): boa parte das telas novas (notas, lembretes, respostas
// rápidas, etiquetas, exportar) foi implementada numa sessão sem o usuário
// presente pra testar ao vivo — os endpoints foram conferidos via curl, mas
// o clique real dentro do WhatsApp Web (digitação nos formulários, o botão
// de cada ferramenta) ainda não foi. Ver [[legaus_kids_whatsapp_extension]].

let legausFunisCache = null;
let legausPainelAberto = true;
let legausUltimoTelefonePainel = null;
let legausNegociosCache = [];
let legausContatoAtual = null; // { existe, contato, negocios } — última resposta de /contatos
let legausRespostasCache = null;
let legausBlurAtivo = false;

const LEGAUS_TELAS = [
  "resumo",
  "salvar-contato",
  "negocios",
  "notas",
  "lembretes",
  "respostas",
  "etiquetas",
  "ferramentas",
];

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

/** Escapa texto do usuário antes de jogar em innerHTML (notas, respostas, etiquetas, títulos). */
function legausEscaparHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto ?? "";
  return div.innerHTML;
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
        <!-- A navegação entre telas fica numa barra flutuante sobre a conversa
             (estilo Waseller), não aqui dentro — ver legausInjetarIconesFlutuantes(). -->

        <!-- Tela: resumo do contato — sempre com opção de salvar/atualizar -->
        <div id="legaus-tela-resumo" class="legaus-tela">
          <div class="legaus-contato-card">
            <div>
              <div class="legaus-contato-nome" id="legaus-contato-nome"></div>
              <div class="legaus-contato-telefone" id="legaus-contato-telefone"></div>
            </div>
            <span class="legaus-badge-novo" id="legaus-badge-sem-nome" style="display:none">SEM NOME</span>
          </div>
          <button id="legaus-salvar-contato" class="legaus-btn-primario">Salvar contato no CRM</button>

          <div class="legaus-secao-titulo">Ações rápidas</div>
          <button id="legaus-ir-negocios" class="legaus-card-acao">
            <span>
              <span class="legaus-card-acao-titulo">Negócios</span>
              <span class="legaus-card-acao-sub" id="legaus-negocios-resumo">Criar e gerenciar negócios desse contato</span>
            </span>
            <span class="legaus-card-acao-seta">›</span>
          </button>
        </div>

        <!-- Tela: salvar/atualizar contato -->
        <div id="legaus-tela-salvar-contato" class="legaus-tela" style="display:none">
          <button id="legaus-voltar-salvar-contato" class="legaus-breadcrumb">‹ Voltar</button>
          <div class="legaus-form-titulo">Salvar contato</div>
          <form id="legaus-form-contato">
            <label>Nome</label>
            <input id="legaus-contato-form-nome" type="text" />
            <label>WhatsApp</label>
            <input id="legaus-contato-form-telefone" type="text" disabled />
            <label>Empresa (opcional)</label>
            <input id="legaus-contato-form-empresa" type="text" placeholder="Nome da empresa" />
            <label class="legaus-checkbox-linha">
              <input id="legaus-contato-form-sync-whatsapp" type="checkbox" checked />
              Também abrir no WhatsApp, pré-preenchido, pra eu confirmar e sincronizar com o celular
            </label>
            <div class="legaus-form-botoes">
              <button type="button" id="legaus-cancelar-contato">Cancelar</button>
              <button type="submit" class="legaus-btn-primario">Salvar no CRM</button>
            </div>
          </form>
          <div id="legaus-status-contato" class="legaus-status"></div>
        </div>

        <!-- Tela: negócios do contato (lista de cards + criar) -->
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

        <!-- Tela: notas internas do contato -->
        <div id="legaus-tela-notas" class="legaus-tela" style="display:none">
          <div class="legaus-secao-titulo">Notas</div>
          <div id="legaus-lista-notas"></div>
          <form id="legaus-form-nota">
            <textarea id="legaus-nota-texto" rows="2" placeholder="Escreva uma nota sobre esse contato..."></textarea>
            <button type="submit" class="legaus-btn-primario">Adicionar nota</button>
          </form>
          <div id="legaus-status-nota" class="legaus-status"></div>
        </div>

        <!-- Tela: lembretes -->
        <div id="legaus-tela-lembretes" class="legaus-tela" style="display:none">
          <div class="legaus-secao-titulo">Lembretes</div>
          <p class="legaus-texto-ajuda">Cria um lembrete pra você — aparece no sininho de notificações do CRM.</p>
          <form id="legaus-form-lembrete">
            <textarea id="legaus-lembrete-texto" rows="2" placeholder="Ex.: Ligar de volta pra confirmar orçamento"></textarea>
            <button type="submit" class="legaus-btn-primario">Criar lembrete</button>
          </form>
          <div id="legaus-status-lembrete" class="legaus-status"></div>
        </div>

        <!-- Tela: respostas rápidas -->
        <div id="legaus-tela-respostas" class="legaus-tela" style="display:none">
          <div class="legaus-secao-titulo">Respostas rápidas</div>
          <p class="legaus-texto-ajuda">Clique numa resposta pra inserir na caixa de mensagem.</p>
          <div id="legaus-lista-respostas"></div>
        </div>

        <!-- Tela: etiquetas -->
        <div id="legaus-tela-etiquetas" class="legaus-tela" style="display:none">
          <div class="legaus-secao-titulo">Etiquetas</div>
          <div id="legaus-chips-etiquetas" class="legaus-chips"></div>
          <form id="legaus-form-etiqueta" class="legaus-form-linha">
            <input id="legaus-etiqueta-nova" type="text" placeholder="Nova etiqueta" />
            <button type="submit" class="legaus-btn-secundario">+</button>
          </form>
          <div id="legaus-status-etiqueta" class="legaus-status"></div>
        </div>

        <!-- Tela: ferramentas -->
        <div id="legaus-tela-ferramentas" class="legaus-tela" style="display:none">
          <div id="legaus-lista-ferramentas">
            <div class="legaus-secao-titulo">Ferramentas</div>

            <button type="button" id="legaus-ferramenta-agenda" class="legaus-card-acao">
              <span>
                <span class="legaus-card-acao-titulo">📅 Agendar reunião</span>
                <span class="legaus-card-acao-sub">Cria um evento no Google Agenda</span>
              </span>
              <span class="legaus-card-acao-seta">›</span>
            </button>

            <button type="button" id="legaus-ferramenta-massa" class="legaus-card-acao">
              <span>
                <span class="legaus-card-acao-titulo">📢 Envio em massa</span>
                <span class="legaus-card-acao-sub">Manda a mesma mensagem pra vários números</span>
              </span>
              <span class="legaus-card-acao-seta">›</span>
            </button>

            <button type="button" id="legaus-ferramenta-exportar" class="legaus-card-acao">
              <span>
                <span class="legaus-card-acao-titulo">📤 Exportar contatos</span>
                <span class="legaus-card-acao-sub">Baixa todos os contatos do CRM em CSV</span>
              </span>
              <span class="legaus-card-acao-seta">›</span>
            </button>

            <button type="button" id="legaus-ferramenta-blur" class="legaus-card-acao">
              <span>
                <span class="legaus-card-acao-titulo">🙈 Borrar mensagens</span>
                <span class="legaus-card-acao-sub" id="legaus-blur-estado">Desligado — útil pra gravar vídeos</span>
              </span>
              <span class="legaus-card-acao-seta">›</span>
            </button>

            <button type="button" id="legaus-ferramenta-ia" class="legaus-card-acao">
              <span>
                <span class="legaus-card-acao-titulo">🤖 Assistente IA</span>
                <span class="legaus-card-acao-sub" id="legaus-ia-estado">Em breve</span>
              </span>
              <span class="legaus-card-acao-seta">›</span>
            </button>
          </div>

          <div id="legaus-sub-envio-massa" class="legaus-subtela" style="display:none">
            <button type="button" id="legaus-voltar-massa" class="legaus-breadcrumb">‹ Voltar</button>
            <div class="legaus-form-titulo">Envio em massa</div>
            <label>Números (um por linha, com DDD)</label>
            <textarea id="legaus-massa-numeros" rows="4" placeholder="5551999999999&#10;5551988888888"></textarea>
            <label>Mensagem</label>
            <textarea id="legaus-massa-texto" rows="3" placeholder="Digite a mensagem..."></textarea>
            <button type="button" id="legaus-massa-enviar" class="legaus-btn-primario">Enviar pra todos</button>
            <div id="legaus-massa-progresso" class="legaus-status"></div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(painel);

  document.getElementById("legaus-toggle").addEventListener("click", legausAlternarPainel);

  document.getElementById("legaus-salvar-contato").addEventListener("click", legausAbrirFormContato);
  document.getElementById("legaus-voltar-salvar-contato").addEventListener("click", () => legausMostrarTela("resumo"));
  document.getElementById("legaus-cancelar-contato").addEventListener("click", () => legausMostrarTela("resumo"));
  document.getElementById("legaus-form-contato").addEventListener("submit", legausSalvarContato);

  document.getElementById("legaus-ir-negocios").addEventListener("click", () => legausMostrarTela("negocios"));
  document.getElementById("legaus-voltar-negocios").addEventListener("click", () => legausMostrarTela("resumo"));
  document.getElementById("legaus-toggle-form-negocio").addEventListener("click", () => legausAlternarFormNegocio(true));
  document.getElementById("legaus-cancelar-negocio").addEventListener("click", () => legausAlternarFormNegocio(false));
  document.getElementById("legaus-form-negocio").addEventListener("submit", legausCriarNegocio);

  document.getElementById("legaus-form-nota").addEventListener("submit", legausCriarNota);
  document.getElementById("legaus-form-lembrete").addEventListener("submit", legausCriarLembrete);
  document.getElementById("legaus-form-etiqueta").addEventListener("submit", legausEnviarNovaEtiqueta);

  document.getElementById("legaus-ferramenta-agenda").addEventListener("click", legausAgendarReuniao);
  document.getElementById("legaus-ferramenta-massa").addEventListener("click", () => legausAlternarSubMassa(true));
  document.getElementById("legaus-voltar-massa").addEventListener("click", () => legausAlternarSubMassa(false));
  document.getElementById("legaus-massa-enviar").addEventListener("click", legausEnviarEmMassa);
  document.getElementById("legaus-ferramenta-exportar").addEventListener("click", legausExportarContatos);
  document.getElementById("legaus-ferramenta-blur").addEventListener("click", legausAlternarBlur);
  document.getElementById("legaus-ferramenta-ia").addEventListener("click", () => {
    document.getElementById("legaus-ia-estado").textContent = "Ainda não disponível — em desenvolvimento.";
  });

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
  for (const id of LEGAUS_TELAS) {
    const tela = document.getElementById(`legaus-tela-${id}`);
    if (tela) tela.style.display = id === nome ? "block" : "none";
  }
  document.querySelectorAll(".legaus-icone-flutuante").forEach((btn) => {
    btn.classList.toggle("legaus-icone-flutuante-ativo", btn.dataset.tela === nome);
  });
}

function legausIrPara(tela) {
  legausAplicarEstadoPainel(true);
  chrome.storage.local.set({ legausPainelAberto: true });
  legausMostrarTela(tela);
  if (tela === "notas") legausCarregarNotas();
  if (tela === "respostas") legausCarregarRespostas();
  if (tela === "etiquetas") legausCarregarEtiquetas();
  if (tela === "ferramentas") legausAlternarSubMassa(false);
}

/**
 * Barra de ícones flutuante sobre a conversa aberta (estilo Waseller) —
 * clicar num ícone abre o painel lateral já na tela certa. Fica ancorada
 * pela posição real da lista de conversas (getBoundingClientRect), não por
 * um valor fixo, pra continuar alinhada se a janela for redimensionada.
 */
function legausInjetarIconesFlutuantes() {
  if (document.getElementById("legaus-icones-flutuantes")) {
    legausReposicionarIconesFlutuantes();
    return;
  }

  const barra = document.createElement("div");
  barra.id = "legaus-icones-flutuantes";
  barra.innerHTML = `
    <button type="button" class="legaus-icone-flutuante" data-tela="resumo" title="Resumo">🏠</button>
    <button type="button" class="legaus-icone-flutuante" data-tela="notas" title="Notas">📝</button>
    <button type="button" class="legaus-icone-flutuante" data-tela="lembretes" title="Lembretes">⏰</button>
    <button type="button" class="legaus-icone-flutuante" data-tela="respostas" title="Respostas rápidas">⚡</button>
    <button type="button" class="legaus-icone-flutuante" data-tela="etiquetas" title="Etiquetas">🏷️</button>
    <button type="button" class="legaus-icone-flutuante" data-tela="ferramentas" title="Ferramentas">🧰</button>
  `;
  document.body.appendChild(barra);

  barra.querySelectorAll(".legaus-icone-flutuante").forEach((btn) => {
    btn.addEventListener("click", () => legausIrPara(btn.dataset.tela));
  });

  legausReposicionarIconesFlutuantes();
}

function legausReposicionarIconesFlutuantes() {
  const barra = document.getElementById("legaus-icones-flutuantes");
  const listaConversas = primeiroElemento(LEGAUS_SELECTORS.listaConversas);
  if (!barra || !listaConversas) return;

  const cabecalho = primeiroElemento(LEGAUS_SELECTORS.cabecalhoConversa);
  const rectLista = listaConversas.getBoundingClientRect();
  const rectCabecalho = cabecalho?.getBoundingClientRect();

  barra.style.left = `${Math.round(rectLista.right + 8)}px`;
  barra.style.top = `${Math.round((rectCabecalho?.bottom ?? 60) + 12)}px`;
}

function legausRemoverIconesFlutuantes() {
  document.getElementById("legaus-icones-flutuantes")?.remove();
}

async function legausAlternarFormNegocio(mostrar) {
  const form = document.getElementById("legaus-form-negocio");
  form.style.display = mostrar ? "flex" : "none";
  document.getElementById("legaus-status-negocio").textContent = "";
  if (mostrar) {
    const telefone = legausUltimoTelefonePainel;
    document.getElementById("legaus-negocio-titulo").value = ((await nomeDaConversaAtual()) || telefone || "").trim();
  }
}

async function legausCarregarFunis() {
  try {
    const dados = await legausChamarApi("/api/integracoes/whatsapp/funis");
    legausFunisCache = dados.funis;
    const select = document.getElementById("legaus-negocio-funil");
    if (select) {
      select.innerHTML = legausFunisCache.map((f) => `<option value="${f.id}">${legausEscaparHtml(f.nome)}</option>`).join("");
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
        <div class="legaus-negocio-titulo">${legausEscaparHtml(n.titulo)}</div>
        <div class="legaus-negocio-valor">${legausFormatarReais(n.valorCentavos)}</div>
        <div class="legaus-negocio-etapa">${legausEscaparHtml(n.funil)} · ${legausEscaparHtml(n.etapa)}</div>
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
    legausRemoverIconesFlutuantes();
    return;
  }

  legausInjetarIconesFlutuantes();

  if (telefone === legausUltimoTelefonePainel) return;
  legausUltimoTelefonePainel = telefone;

  semConversa.style.display = "none";
  comConversa.style.display = "block";

  // Usa o texto do cabeçalho direto aqui (sem abrir o painel de dados do
  // contato) — abrir/fechar esse painel automaticamente a cada troca de
  // conversa causava um Escape atrasado (~600ms) que às vezes fechava a
  // conversa errada quando o usuário trocava de conversa rápido demais.
  // O nome completo (fallback do perfil comercial) só é buscado quando o
  // usuário efetivamente clica em salvar (legausAbrirFormContato/legausCriarNegocio).
  const nomeDaConversa = (cabecalhoAtualTexto || telefone).trim();
  const info = await legausBuscarContato(telefone);
  legausContatoAtual = info;

  const semNomeSalvo = !info?.existe || info.contato.nome === info.contato.telefone;
  // Enquanto não tem nome salvo no CRM, mostra o nome que já vem do próprio
  // WhatsApp (é o que vai ser gravado ao clicar em "Salvar contato").
  const nomeExibido = semNomeSalvo ? nomeDaConversa : info.contato.nome;

  document.getElementById("legaus-contato-nome").textContent = nomeExibido;
  document.getElementById("legaus-contato-telefone").textContent = telefone;
  document.getElementById("legaus-badge-sem-nome").style.display = semNomeSalvo ? "inline-flex" : "none";

  legausRenderizarNegocios(info?.negocios ?? []);
  legausAtualizarResumoNegocios();
  document.getElementById("legaus-status-negocio").textContent = "";
  legausAlternarFormNegocio(false);
  legausAlternarSubMassa(false);
  document.getElementById("legaus-lista-notas").innerHTML = "";
  legausRenderizarEtiquetas(info?.contato?.tags ?? []);
  legausMostrarTela("resumo");
}

/** Abre a tela de formulário já com o nome puxado do WhatsApp (ou o já salvo no CRM). */
async function legausAbrirFormContato() {
  const telefone = legausUltimoTelefonePainel;
  const semNomeSalvo = !legausContatoAtual?.existe || legausContatoAtual.contato.nome === legausContatoAtual.contato.telefone;
  const nomeSugerido = semNomeSalvo
    ? ((await nomeDaConversaAtual()) || telefone || "").trim()
    : legausContatoAtual.contato.nome;

  document.getElementById("legaus-contato-form-nome").value = nomeSugerido;
  document.getElementById("legaus-contato-form-telefone").value = telefone || "";
  document.getElementById("legaus-contato-form-empresa").value = legausContatoAtual?.contato?.empresa || "";
  document.getElementById("legaus-status-contato").textContent = "";
  legausMostrarTela("salvar-contato");
}

async function legausSalvarContato(evento) {
  evento.preventDefault();
  const status = document.getElementById("legaus-status-contato");
  const telefone = legausUltimoTelefonePainel;
  if (!telefone) return;

  const nome = document.getElementById("legaus-contato-form-nome").value.trim();
  const empresa = document.getElementById("legaus-contato-form-empresa").value.trim();
  if (!nome) {
    status.textContent = "Preencha o nome.";
    status.className = "legaus-status legaus-status-erro";
    return;
  }

  const tambemAbrirNoWhatsApp = document.getElementById("legaus-contato-form-sync-whatsapp").checked;

  status.textContent = "Salvando...";
  status.className = "legaus-status";
  try {
    await legausChamarApi("/api/integracoes/whatsapp/contatos", {
      method: "POST",
      body: JSON.stringify({ telefone, nome, empresa: empresa || undefined }),
    });
    legausUltimoTelefonePainel = null; // força reconsulta pra pegar o contato atualizado
    await legausAtualizarConversaNoPainel();

    if (tambemAbrirNoWhatsApp) {
      try {
        const abriu = await abrirNovoContatoNativoPreenchido(nome, telefone);
        if (!abriu) log("Não achei a tela nativa \"Novo contato\" do WhatsApp — seletores podem ter mudado.");
      } catch (erroWhatsApp) {
        log("Falha ao pré-preencher o contato nativo do WhatsApp:", erroWhatsApp.message);
      }
    }
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
        nomeContato: await nomeDaConversaAtual(),
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

// ---------- Notas ----------

async function legausCarregarNotas() {
  const telefone = legausUltimoTelefonePainel;
  const lista = document.getElementById("legaus-lista-notas");
  if (!telefone) return;
  lista.innerHTML = `<div class="legaus-sem-negocios">Carregando...</div>`;
  try {
    const dados = await legausChamarApi(`/api/integracoes/whatsapp/notas?telefone=${encodeURIComponent(telefone)}`);
    legausRenderizarNotas(dados.notas);
  } catch (erro) {
    lista.innerHTML = `<div class="legaus-status legaus-status-erro">${legausEscaparHtml(erro.message)}</div>`;
  }
}

function legausRenderizarNotas(notas) {
  const lista = document.getElementById("legaus-lista-notas");
  if (!notas || notas.length === 0) {
    lista.innerHTML = `<div class="legaus-sem-negocios">Nenhuma nota ainda.</div>`;
    return;
  }
  lista.innerHTML = notas
    .map(
      (n) => `
      <div class="legaus-nota-card">
        <div class="legaus-nota-texto">${legausEscaparHtml(n.texto)}</div>
        <div class="legaus-nota-meta">${legausEscaparHtml(n.autorNome)} · ${new Date(n.criadaEm).toLocaleDateString("pt-BR")}</div>
      </div>`,
    )
    .join("");
}

async function legausCriarNota(evento) {
  evento.preventDefault();
  const telefone = legausUltimoTelefonePainel;
  const textarea = document.getElementById("legaus-nota-texto");
  const texto = textarea.value.trim();
  const status = document.getElementById("legaus-status-nota");
  if (!telefone || !texto) return;

  status.textContent = "Salvando...";
  status.className = "legaus-status";
  try {
    await legausChamarApi("/api/integracoes/whatsapp/notas", {
      method: "POST",
      body: JSON.stringify({ telefone, texto }),
    });
    textarea.value = "";
    status.textContent = "";
    await legausCarregarNotas();
  } catch (erro) {
    status.textContent = erro.message;
    status.className = "legaus-status legaus-status-erro";
  }
}

// ---------- Lembretes ----------

async function legausCriarLembrete(evento) {
  evento.preventDefault();
  const textarea = document.getElementById("legaus-lembrete-texto");
  const texto = textarea.value.trim();
  const status = document.getElementById("legaus-status-lembrete");
  if (!texto) return;

  status.textContent = "Criando...";
  status.className = "legaus-status";
  try {
    const nome = ((await nomeDaConversaAtual()) || legausUltimoTelefonePainel || "").trim();
    await legausChamarApi("/api/integracoes/whatsapp/lembretes", {
      method: "POST",
      body: JSON.stringify({ texto: nome ? `${nome}: ${texto}` : texto }),
    });
    textarea.value = "";
    status.textContent = "Lembrete criado — veja no sininho do CRM.";
    status.className = "legaus-status legaus-status-ok";
  } catch (erro) {
    status.textContent = erro.message;
    status.className = "legaus-status legaus-status-erro";
  }
}

// ---------- Respostas rápidas ----------

async function legausCarregarRespostas() {
  const lista = document.getElementById("legaus-lista-respostas");
  if (legausRespostasCache) {
    legausRenderizarRespostas(legausRespostasCache);
    return;
  }
  lista.innerHTML = `<div class="legaus-sem-negocios">Carregando...</div>`;
  try {
    const dados = await legausChamarApi("/api/integracoes/whatsapp/respostas-rapidas");
    legausRespostasCache = dados.respostas;
    legausRenderizarRespostas(legausRespostasCache);
  } catch (erro) {
    lista.innerHTML = `<div class="legaus-status legaus-status-erro">${legausEscaparHtml(erro.message)}</div>`;
  }
}

function legausRenderizarRespostas(respostas) {
  const lista = document.getElementById("legaus-lista-respostas");
  if (respostas.length === 0) {
    lista.innerHTML = `<div class="legaus-sem-negocios">Nenhuma resposta rápida cadastrada. Crie em /respostas no CRM.</div>`;
    return;
  }
  lista.innerHTML = respostas
    .map(
      (r, i) => `
      <button type="button" class="legaus-resposta-card" data-indice="${i}">
        <div class="legaus-resposta-titulo">${legausEscaparHtml(r.titulo)}</div>
        <div class="legaus-resposta-texto">${legausEscaparHtml(r.texto)}</div>
      </button>`,
    )
    .join("");
  lista.querySelectorAll(".legaus-resposta-card").forEach((el) => {
    el.addEventListener("click", () => {
      const resposta = respostas[Number(el.dataset.indice)];
      const digitou = digitarNaCaixaDeComposicao(resposta.texto);
      if (!digitou) log("Não achei a caixa de composição pra inserir a resposta rápida.");
    });
  });
}

// ---------- Etiquetas ----------

function legausCarregarEtiquetas() {
  legausRenderizarEtiquetas(legausContatoAtual?.contato?.tags ?? []);
}

function legausRenderizarEtiquetas(tags) {
  const chips = document.getElementById("legaus-chips-etiquetas");
  if (!chips) return;
  if (!tags || tags.length === 0) {
    chips.innerHTML = `<div class="legaus-sem-negocios">Nenhuma etiqueta ainda.</div>`;
    return;
  }
  chips.innerHTML = tags
    .map(
      (t, i) => `
      <span class="legaus-chip">${legausEscaparHtml(t)} <button type="button" class="legaus-chip-remover" data-indice="${i}">×</button></span>`,
    )
    .join("");
  chips.querySelectorAll(".legaus-chip-remover").forEach((btn) => {
    btn.addEventListener("click", () => {
      const restantes = tags.filter((_, i) => i !== Number(btn.dataset.indice));
      legausSalvarEtiquetas(restantes);
    });
  });
}

async function legausSalvarEtiquetas(novasTags) {
  const telefone = legausUltimoTelefonePainel;
  const status = document.getElementById("legaus-status-etiqueta");
  if (!telefone) return;
  try {
    const resultado = await legausChamarApi("/api/integracoes/whatsapp/contatos/tags", {
      method: "POST",
      body: JSON.stringify({ telefone, tags: novasTags }),
    });
    if (legausContatoAtual?.contato) legausContatoAtual.contato.tags = resultado.tags;
    legausRenderizarEtiquetas(resultado.tags);
    status.textContent = "";
  } catch (erro) {
    status.textContent = erro.message;
    status.className = "legaus-status legaus-status-erro";
  }
}

function legausEnviarNovaEtiqueta(evento) {
  evento.preventDefault();
  const input = document.getElementById("legaus-etiqueta-nova");
  const nova = input.value.trim();
  if (!nova) return;
  const atuais = legausContatoAtual?.contato?.tags ?? [];
  input.value = "";
  if (atuais.includes(nova)) return;
  legausSalvarEtiquetas([...atuais, nova]);
}

// ---------- Ferramentas ----------

function legausAgendarReuniao() {
  const nome = document.getElementById("legaus-contato-nome")?.textContent || "";
  const titulo = encodeURIComponent(`Reunião — ${nome}`);
  const detalhes = encodeURIComponent(`Reunião com ${nome} (agendada via Legaus Kids CRM)`);
  const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${titulo}&details=${detalhes}`;
  window.open(url, "_blank", "noopener");
}

function legausAlternarSubMassa(mostrar) {
  const lista = document.getElementById("legaus-lista-ferramentas");
  const sub = document.getElementById("legaus-sub-envio-massa");
  if (!lista || !sub) return;
  lista.style.display = mostrar ? "none" : "block";
  sub.style.display = mostrar ? "block" : "none";
  if (!mostrar) {
    document.getElementById("legaus-massa-progresso").textContent = "";
  }
}

/**
 * NÃO envia nada diretamente daqui — chamar enviarMensagemReal() em loop pra
 * vários números quebraria assim que o primeiro precisasse navegar pra outra
 * conversa (location.href destrói o content script no meio do await,
 * matando o resto do loop). Em vez disso, cria uma Mensagem SAIDA pendente
 * por número (mesmo mecanismo do composer do Atendimento) — a fila normal
 * (GET fila-envio + alarme de 1 min do background.js) cuida de retransmitir
 * uma de cada vez, já com o retry-por-navegação testado. NÃO testado ao
 * vivo ainda (a criação das mensagens foi confirmada via curl; a
 * retransmissão real depende do alarme, que já é código existente).
 */
async function legausEnviarEmMassa() {
  const numerosRaw = document.getElementById("legaus-massa-numeros").value;
  const texto = document.getElementById("legaus-massa-texto").value.trim();
  const progresso = document.getElementById("legaus-massa-progresso");
  const numeros = [...new Set(numerosRaw.split("\n").map((n) => n.replace(/\D/g, "")).filter((n) => n.length >= 10))];

  if (numeros.length === 0 || !texto) {
    progresso.textContent = "Preencha ao menos um número válido e a mensagem.";
    progresso.className = "legaus-status legaus-status-erro";
    return;
  }

  const botao = document.getElementById("legaus-massa-enviar");
  botao.disabled = true;
  progresso.textContent = "Agendando...";
  progresso.className = "legaus-status";
  try {
    const resultado = await legausChamarApi("/api/integracoes/whatsapp/envio-massa", {
      method: "POST",
      body: JSON.stringify({ numeros, texto }),
    });
    progresso.textContent = `${resultado.criadas} mensagens agendadas — serão enviadas em alguns minutos pela fila automática da extensão.`;
    progresso.className = "legaus-status legaus-status-ok";
  } catch (erro) {
    progresso.textContent = erro.message;
    progresso.className = "legaus-status legaus-status-erro";
  }
  botao.disabled = false;
}

async function legausExportarContatos() {
  const resultado = await chrome.runtime.sendMessage({
    type: "LEGAUS_API_CALL_TEXTO",
    caminho: "/api/integracoes/whatsapp/contatos/exportar",
  });
  if (!resultado?.ok) {
    log("Falha ao exportar contatos:", resultado?.texto);
    return;
  }
  const blob = new Blob([resultado.texto], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "contatos-legaus-kids.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function legausAlternarBlur() {
  legausBlurAtivo = !legausBlurAtivo;
  document.body.classList.toggle("legaus-mensagens-borradas", legausBlurAtivo);
  const rotulo = document.getElementById("legaus-blur-estado");
  if (rotulo) {
    rotulo.textContent = legausBlurAtivo ? "Ligado — mensagens borradas" : "Desligado — útil pra gravar vídeos";
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

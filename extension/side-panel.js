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
  "catalogos",
  "mensagens-agendadas",
  "calendario",
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

          <div class="legaus-secao-titulo">Etiquetas</div>
          <div id="legaus-chips-etiquetas-perfil" class="legaus-chips"></div>
          <form id="legaus-form-etiqueta-perfil" class="legaus-form-linha">
            <input id="legaus-etiqueta-nova-perfil" type="text" placeholder="Nova etiqueta" />
            <button type="submit" class="legaus-btn-secundario">+</button>
          </form>
          <button type="button" id="legaus-sincronizar-etiquetas-perfil" class="legaus-link-acao">
            🔄 Sincronizar com WhatsApp Business
          </button>
          <div id="legaus-status-etiqueta-perfil" class="legaus-status"></div>

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

        <!-- Tela: catálogos (só leitura por enquanto — cadastro vem depois) -->
        <div id="legaus-tela-catalogos" class="legaus-tela" style="display:none">
          <div class="legaus-secao-titulo">Catálogos</div>
          <div id="legaus-lista-catalogos"></div>
        </div>

        <!-- Tela: mensagens agendadas do contato -->
        <div id="legaus-tela-mensagens-agendadas" class="legaus-tela" style="display:none">
          <div class="legaus-secao-titulo">Mensagens agendadas</div>
          <div id="legaus-lista-mensagens-agendadas"></div>
          <form id="legaus-form-mensagem-agendada">
            <textarea id="legaus-agendada-texto" rows="2" placeholder="O que enviar..."></textarea>
            <label>Enviar em</label>
            <input id="legaus-agendada-data" type="datetime-local" />
            <button type="submit" class="legaus-btn-primario">Agendar</button>
          </form>
          <div id="legaus-status-agendada" class="legaus-status"></div>
        </div>

        <!-- Tela: adicionar evento ao calendário (Google Agenda) -->
        <div id="legaus-tela-calendario" class="legaus-tela" style="display:none">
          <div class="legaus-secao-titulo">Adicionar ao calendário</div>
          <form id="legaus-form-calendario">
            <label>Título</label>
            <input id="legaus-calendario-titulo" type="text" />
            <label>Data</label>
            <input id="legaus-calendario-data" type="date" />
            <label>Hora</label>
            <input id="legaus-calendario-hora" type="time" />
            <label>Descrição (opcional)</label>
            <textarea id="legaus-calendario-descricao" rows="2"></textarea>
            <button type="submit" class="legaus-btn-primario">Adicionar ao Google Agenda</button>
          </form>
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
          <div class="legaus-form-titulo">Crie um lembrete</div>
          <p class="legaus-texto-ajuda">
            Assim que um lembrete for definido, você será notificado no horário escolhido. Os lembretes podem ser
            encontrados nas notificações do CRM.
          </p>
          <form id="legaus-form-lembrete">
            <label>Nome</label>
            <input id="legaus-lembrete-nome" type="text" placeholder="Dê um nome ao seu lembrete" />
            <label>Descrição</label>
            <textarea id="legaus-lembrete-descricao" rows="2" placeholder="Adicione uma descrição"></textarea>
            <label>Data</label>
            <input id="legaus-lembrete-data" type="date" />
            <label>Hora</label>
            <input id="legaus-lembrete-hora" type="time" />
            <label class="legaus-checkbox-linha">
              <input id="legaus-lembrete-google" type="checkbox" />
              Adicionar ao calendário do Google
            </label>
            <div class="legaus-form-botoes">
              <button type="button" id="legaus-cancelar-lembrete">Cancelar</button>
              <button type="submit" class="legaus-btn-primario">Criar evento</button>
            </div>
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
          <button type="button" id="legaus-sincronizar-etiquetas" class="legaus-link-acao">
            🔄 Sincronizar com WhatsApp Business
          </button>
          <p class="legaus-texto-ajuda">
            Abra "Dados do contato" no WhatsApp (clique no nome/foto no topo da conversa) antes de sincronizar.
          </p>
          <div id="legaus-status-etiqueta" class="legaus-status"></div>
        </div>

        <!-- Tela: ferramentas -->
        <div id="legaus-tela-ferramentas" class="legaus-tela" style="display:none">
          <div id="legaus-lista-ferramentas">
            <div class="legaus-secao-titulo">Mais</div>

            <button type="button" id="legaus-ferramenta-respostas" class="legaus-card-acao">
              <span>
                <span class="legaus-card-acao-titulo">💬 Respostas rápidas</span>
                <span class="legaus-card-acao-sub">Insere uma resposta pronta na conversa</span>
              </span>
              <span class="legaus-card-acao-seta">›</span>
            </button>

            <button type="button" id="legaus-ferramenta-etiquetas" class="legaus-card-acao">
              <span>
                <span class="legaus-card-acao-titulo">🏷️ Etiquetas</span>
                <span class="legaus-card-acao-sub">Gerenciar etiquetas desse contato</span>
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
  document.getElementById("legaus-cancelar-lembrete").addEventListener("click", () => legausMostrarTela("resumo"));
  document.getElementById("legaus-form-etiqueta").addEventListener("submit", legausEnviarNovaEtiqueta);
  document.getElementById("legaus-form-etiqueta-perfil").addEventListener("submit", legausEnviarNovaEtiqueta);
  document.getElementById("legaus-sincronizar-etiquetas").addEventListener("click", legausSincronizarEtiquetasWhatsApp);
  document.getElementById("legaus-sincronizar-etiquetas-perfil").addEventListener("click", legausSincronizarEtiquetasWhatsApp);
  document.getElementById("legaus-form-mensagem-agendada").addEventListener("submit", legausCriarMensagemAgendada);
  document.getElementById("legaus-form-calendario").addEventListener("submit", legausAdicionarEventoCalendario);

  document.getElementById("legaus-ferramenta-respostas").addEventListener("click", () => legausIrPara("respostas"));
  document.getElementById("legaus-ferramenta-etiquetas").addEventListener("click", () => legausIrPara("etiquetas"));
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

async function legausIrPara(tela) {
  legausAplicarEstadoPainel(true);
  chrome.storage.local.set({ legausPainelAberto: true });
  legausMostrarTela(tela);
  if (tela === "notas") legausCarregarNotas();
  if (tela === "lembretes") {
    document.getElementById("legaus-form-lembrete").reset();
    document.getElementById("legaus-status-lembrete").textContent = "";
  }
  if (tela === "respostas") legausCarregarRespostas();
  if (tela === "etiquetas") legausCarregarEtiquetas();
  if (tela === "ferramentas") legausAlternarSubMassa(false);
  if (tela === "catalogos") legausCarregarCatalogos();
  if (tela === "mensagens-agendadas") legausCarregarMensagensAgendadas();
  if (tela === "calendario") {
    const nome = ((await nomeDaConversaAtual()) || legausUltimoTelefonePainel || "").trim();
    document.getElementById("legaus-calendario-titulo").value = nome ? `Reunião — ${nome}` : "";
    document.getElementById("legaus-calendario-data").value = "";
    document.getElementById("legaus-calendario-hora").value = "";
    document.getElementById("legaus-calendario-descricao").value = "";
  }
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
    <button type="button" class="legaus-icone-flutuante" data-tela="catalogos" title="Catálogos">📦</button>
    <button type="button" class="legaus-icone-flutuante" data-tela="resumo" title="Perfil">👤</button>
    <button type="button" class="legaus-icone-flutuante" data-tela="mensagens-agendadas" title="Mensagens agendadas">🕐</button>
    <button type="button" class="legaus-icone-flutuante" data-tela="calendario" title="Calendário">📅</button>
    <button type="button" class="legaus-icone-flutuante" data-tela="notas" title="Anotações">📝</button>
    <button type="button" class="legaus-icone-flutuante" data-tela="lembretes" title="Lembrete">⏰</button>
    <button type="button" class="legaus-icone-flutuante" data-tela="ferramentas" title="Mais">⋯</button>
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
  document.getElementById("legaus-lista-mensagens-agendadas").innerHTML = "";
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
  const nomeLembrete = document.getElementById("legaus-lembrete-nome").value.trim();
  const descricao = document.getElementById("legaus-lembrete-descricao").value.trim();
  const data = document.getElementById("legaus-lembrete-data").value;
  const hora = document.getElementById("legaus-lembrete-hora").value;
  const adicionarGoogle = document.getElementById("legaus-lembrete-google").checked;
  const status = document.getElementById("legaus-status-lembrete");
  if (!nomeLembrete) {
    status.textContent = "Dê um nome ao lembrete.";
    status.className = "legaus-status legaus-status-erro";
    return;
  }

  status.textContent = "Criando...";
  status.className = "legaus-status";
  try {
    const nomeContato = ((await nomeDaConversaAtual()) || legausUltimoTelefonePainel || "").trim();
    await legausChamarApi("/api/integracoes/whatsapp/lembretes", {
      method: "POST",
      body: JSON.stringify({
        nome: nomeContato ? `${nomeContato} — ${nomeLembrete}` : nomeLembrete,
        descricao: descricao || undefined,
        notificarEm: data ? new Date(`${data}T${hora || "09:00"}`).toISOString() : undefined,
      }),
    });

    if (adicionarGoogle && data) {
      legausAbrirGoogleAgenda({ titulo: nomeLembrete, data, hora, descricao });
    }

    document.getElementById("legaus-form-lembrete").reset();
    status.textContent = "Lembrete criado.";
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

/** Etiquetas aparecem em dois lugares (tela Perfil e tela Etiquetas) — renderiza nos dois. */
function legausRenderizarEtiquetas(tags) {
  legausRenderizarChipsEm("legaus-chips-etiquetas", tags);
  legausRenderizarChipsEm("legaus-chips-etiquetas-perfil", tags);
}

/** Etiquetas têm dois conjuntos de elementos (Perfil e tela Etiquetas) — decide qual status usar pelo sufixo do id que originou a ação. */
function legausStatusIdEtiquetas(idOrigem) {
  return idOrigem && idOrigem.endsWith("-perfil") ? "legaus-status-etiqueta-perfil" : "legaus-status-etiqueta";
}

function legausRenderizarChipsEm(containerId, tags) {
  const chips = document.getElementById(containerId);
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
  const statusId = legausStatusIdEtiquetas(containerId);
  chips.querySelectorAll(".legaus-chip-remover").forEach((btn) => {
    btn.addEventListener("click", () => {
      const restantes = tags.filter((_, i) => i !== Number(btn.dataset.indice));
      legausSalvarEtiquetas(restantes, statusId);
    });
  });
}

async function legausSalvarEtiquetas(novasTags, statusId = "legaus-status-etiqueta") {
  const telefone = legausUltimoTelefonePainel;
  const status = document.getElementById(statusId);
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
  const input = evento.target.querySelector('input[type="text"]');
  const nova = input.value.trim();
  if (!nova) return;
  const atuais = legausContatoAtual?.contato?.tags ?? [];
  input.value = "";
  if (atuais.includes(nova)) return;
  legausSalvarEtiquetas([...atuais, nova], legausStatusIdEtiquetas(evento.target.id));
}

/**
 * Lê as etiquetas nativas do WhatsApp Business (via obterEtiquetasWhatsAppDaConversaAberta,
 * em content-script.js) e faz um merge aditivo com as etiquetas já salvas no
 * CRM — nunca remove etiqueta nenhuma, só acrescenta as que vierem do
 * WhatsApp e ainda não existirem aqui. Só funciona com o painel "Dados do
 * contato" do WhatsApp já aberto (não abrimos ele automaticamente, é um
 * comportamento que já causou bug — ver aviso na função em content-script.js).
 */
async function legausSincronizarEtiquetasWhatsApp(evento) {
  const statusId = legausStatusIdEtiquetas(evento?.target?.id);
  const status = document.getElementById(statusId);
  if (!legausUltimoTelefonePainel) return;

  const resultado = obterEtiquetasWhatsAppDaConversaAberta();
  if (!resultado.painelAberto) {
    status.textContent = 'Abra "Dados do contato" no WhatsApp (clique no nome/foto no topo da conversa) e tente de novo.';
    status.className = "legaus-status legaus-status-erro";
    return;
  }
  if (resultado.etiquetas.length === 0) {
    status.textContent = "Não achei etiquetas do WhatsApp Business atribuídas a esse contato.";
    status.className = "legaus-status legaus-status-erro";
    return;
  }

  const atuais = legausContatoAtual?.contato?.tags ?? [];
  const novasDoWhatsapp = resultado.etiquetas.filter((t) => !atuais.includes(t));
  if (novasDoWhatsapp.length === 0) {
    status.textContent = "Etiquetas do WhatsApp já estavam sincronizadas.";
    status.className = "legaus-status legaus-status-ok";
    return;
  }

  await legausSalvarEtiquetas([...atuais, ...novasDoWhatsapp], statusId);
  status.textContent = `${novasDoWhatsapp.length} etiqueta(s) do WhatsApp sincronizada(s): ${novasDoWhatsapp.join(", ")}.`;
  status.className = "legaus-status legaus-status-ok";
}

// ---------- Catálogos ----------

async function legausCarregarCatalogos() {
  const lista = document.getElementById("legaus-lista-catalogos");
  lista.innerHTML = `<div class="legaus-sem-negocios">Carregando...</div>`;
  try {
    const dados = await legausChamarApi("/api/integracoes/whatsapp/catalogos");
    legausRenderizarCatalogos(dados.catalogos);
  } catch (erro) {
    lista.innerHTML = `<div class="legaus-status legaus-status-erro">${legausEscaparHtml(erro.message)}</div>`;
  }
}

function legausRenderizarCatalogos(catalogos) {
  const lista = document.getElementById("legaus-lista-catalogos");
  if (!catalogos || catalogos.length === 0) {
    lista.innerHTML = `<div class="legaus-sem-negocios">Nenhum catálogo cadastrado ainda.</div>`;
    return;
  }
  lista.innerHTML = catalogos
    .map(
      (c) => `
      <div class="legaus-negocio-card" data-url="${legausEscaparHtml(c.url)}">
        <div class="legaus-negocio-titulo">${legausEscaparHtml(c.nome)}</div>
      </div>`,
    )
    .join("");
  lista.querySelectorAll(".legaus-negocio-card").forEach((card) => {
    card.addEventListener("click", () => window.open(card.dataset.url, "_blank", "noopener"));
  });
}

// ---------- Mensagens agendadas ----------

async function legausCarregarMensagensAgendadas() {
  const telefone = legausUltimoTelefonePainel;
  const lista = document.getElementById("legaus-lista-mensagens-agendadas");
  if (!telefone) return;
  lista.innerHTML = `<div class="legaus-sem-negocios">Carregando...</div>`;
  try {
    const dados = await legausChamarApi(`/api/integracoes/whatsapp/mensagens-agendadas?telefone=${encodeURIComponent(telefone)}`);
    legausRenderizarMensagensAgendadas(dados.agendadas);
  } catch (erro) {
    lista.innerHTML = `<div class="legaus-status legaus-status-erro">${legausEscaparHtml(erro.message)}</div>`;
  }
}

function legausRenderizarMensagensAgendadas(agendadas) {
  const lista = document.getElementById("legaus-lista-mensagens-agendadas");
  if (!agendadas || agendadas.length === 0) {
    lista.innerHTML = `<div class="legaus-sem-negocios">Nenhuma mensagem agendada.</div>`;
    return;
  }
  lista.innerHTML = agendadas
    .map(
      (a) => `
      <div class="legaus-nota-card">
        <div class="legaus-nota-texto">${legausEscaparHtml(a.texto)}</div>
        <div class="legaus-nota-meta">Envia em ${new Date(a.agendadaPara).toLocaleString("pt-BR")}</div>
        <button type="button" class="legaus-agendada-cancelar" data-id="${a.id}">Cancelar</button>
      </div>`,
    )
    .join("");
  lista.querySelectorAll(".legaus-agendada-cancelar").forEach((btn) => {
    btn.addEventListener("click", () => legausCancelarMensagemAgendada(btn.dataset.id));
  });
}

async function legausCriarMensagemAgendada(evento) {
  evento.preventDefault();
  const telefone = legausUltimoTelefonePainel;
  const texto = document.getElementById("legaus-agendada-texto").value.trim();
  const dataValor = document.getElementById("legaus-agendada-data").value;
  const status = document.getElementById("legaus-status-agendada");
  if (!telefone || !texto || !dataValor) {
    status.textContent = "Preencha a mensagem e a data/hora.";
    status.className = "legaus-status legaus-status-erro";
    return;
  }

  status.textContent = "Agendando...";
  status.className = "legaus-status";
  try {
    await legausChamarApi("/api/integracoes/whatsapp/mensagens-agendadas", {
      method: "POST",
      body: JSON.stringify({
        telefone,
        nomeContato: await nomeDaConversaAtual(),
        texto,
        agendadaPara: new Date(dataValor).toISOString(),
      }),
    });
    document.getElementById("legaus-agendada-texto").value = "";
    document.getElementById("legaus-agendada-data").value = "";
    status.textContent = "";
    await legausCarregarMensagensAgendadas();
  } catch (erro) {
    status.textContent = erro.message;
    status.className = "legaus-status legaus-status-erro";
  }
}

async function legausCancelarMensagemAgendada(id) {
  try {
    await legausChamarApi("/api/integracoes/whatsapp/mensagens-agendadas", {
      method: "DELETE",
      body: JSON.stringify({ id }),
    });
    await legausCarregarMensagensAgendadas();
  } catch (erro) {
    log("Falha ao cancelar mensagem agendada:", erro.message);
  }
}

// ---------- Calendário ----------

function legausAdicionarEventoCalendario(evento) {
  evento.preventDefault();
  const titulo = document.getElementById("legaus-calendario-titulo").value.trim();
  const data = document.getElementById("legaus-calendario-data").value;
  const hora = document.getElementById("legaus-calendario-hora").value;
  const descricao = document.getElementById("legaus-calendario-descricao").value.trim();
  if (!titulo || !data) return;

  legausAbrirGoogleAgenda({ titulo, data, hora, descricao });
}

/** Abre o Google Agenda com um evento pré-preenchido (usado pela tela Calendário e pelo checkbox do Lembrete). */
function legausAbrirGoogleAgenda({ titulo, data, hora, descricao }) {
  const inicio = new Date(`${data}T${hora || "09:00"}`);
  const fim = new Date(inicio.getTime() + 60 * 60 * 1000);
  const formatar = (d) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: titulo,
    dates: `${formatar(inicio)}/${formatar(fim)}`,
    details: descricao || "",
  });
  window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, "_blank", "noopener");
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

// Seletores de DOM do WhatsApp Web, centralizados aqui de propósito.
//
// Confirmados contra uma sessão real (WhatsApp Business Web) em 2026-08-22.
// O WhatsApp Web não tem API pública nem documentação de estrutura — se a
// sincronização parar de funcionar depois de uma atualização do WhatsApp,
// este é o primeiro arquivo a revisar. Use `window.__legausDebug()` no
// console do WhatsApp Web (com a extensão carregada) pra ver quantos
// elementos cada seletor encontra agora.
//
// Observação importante da inspeção de 2026-08-22: o atributo `data-id`
// das mensagens NÃO contém mais o telefone (formato antigo
// "{true|false}_{telefone}@c.us_{id}" documentado por ferramentas de
// terceiros mais antigas) — agora é só um hash opaco. O telefone da
// conversa aberta precisa vir de outro lugar (ver `obterTelefoneDaConversaAberta`
// em content-script.js).
//
// Cada entrada é uma LISTA de seletores candidatos, testados em ordem —
// facilita adicionar um seletor novo sem apagar o antigo enquanto ajusta.

const LEGAUS_SELECTORS = {
  // Indica que o WhatsApp Web carregou e o usuário está logado (painel de
  // conversas visível), em vez da tela de QR code.
  appLogado: ['[data-testid="chat-list"]'],

  // Tela de QR code (não logado).
  telaQrCode: ['[data-testid="link-device-qr-code"]'],

  // Lista de conversas (barra lateral esquerda).
  listaConversas: ['[data-testid="chat-list"]'],

  // Cada linha/item de conversa dentro da lista.
  itemConversa: ['[data-testid="cell-frame-container"]'],

  // Container das mensagens da conversa aberta no momento.
  painelMensagens: ['[data-testid="conversation-panel-messages"]'],

  // Cada bolha/linha de mensagem dentro do painel. O id único de cada
  // mensagem vem do próprio atributo `data-testid` (formato "conv-msg-{ID}").
  bolhaMensagem: ['[data-testid^="conv-msg-"]'],

  // Dentro de uma bolha: presença indica a direção da mensagem.
  caudaEnviada: ['[data-testid="tail-out"]'],
  caudaRecebida: ['[data-testid="tail-in"]'], // inferido por simetria com tail-out, não confirmado ao vivo ainda

  // Texto da mensagem dentro da bolha.
  textoMensagem: ["span.selectable-text"],

  // Cabeçalho da conversa aberta (nome/telefone do contato).
  cabecalhoConversa: ['[data-testid="conversation-header"]'],
  tituloCabecalho: ['[data-testid="conversation-info-header-chat-title"]'],

  // Caixa de composição de texto (contenteditable) da conversa aberta.
  // O aria-label é "Digite uma mensagem para {nome ou telefone}" — útil
  // tanto pra achar o elemento quanto (quando o contato não tem nome
  // salvo) pra extrair o telefone direto, sem abrir o painel de contato.
  caixaComposicao: ['footer [contenteditable="true"]'],

  // Botão de enviar mensagem — só aparece depois que a caixa tem texto.
  botaoEnviar: ['footer button[aria-label="Enviar"]'],

  // Seção "Recado e número de telefone" no painel de dados do contato
  // (abre clicando no cabeçalho da conversa) — fallback pra achar o
  // telefone quando o contato tem nome salvo e o aria-label do composer
  // não mostra o número.
  secaoTelefoneContato: ['[data-testid="section-about-and-phone-number"]'],

  // Fluxo nativo "Novo contato" do WhatsApp Web (confirmado ao vivo em
  // 2026-08-22) — usado pra pré-preencher nome/telefone quando o usuário
  // salva um contato no CRM, deixando a sincronização com o celular pro
  // clique final do próprio usuário (não automatizamos o clique em salvar).
  botaoNovaConversa: ['[title="Nova conversa"]'],
  campoNomeNovoContato: ['div[data-testid="text-input"][aria-label="Nome"]'],
  campoTelefoneNovoContato: ['input[data-testid="phone-number-input"]'],
  toggleSincronizarNovoContato: ['input[data-testid="save-contact-drawer"]'],
};

function contarCandidatos(seletores) {
  for (const seletor of seletores) {
    try {
      const encontrados = document.querySelectorAll(seletor).length;
      if (encontrados > 0) return { seletor, encontrados };
    } catch {
      // seletor inválido nesta versão do navegador — ignora e tenta o próximo
    }
  }
  return { seletor: null, encontrados: 0 };
}

function primeiroElemento(seletores, root = document) {
  for (const seletor of seletores) {
    try {
      const el = root.querySelector(seletor);
      if (el) return el;
    } catch {
      // ignora seletor inválido
    }
  }
  return null;
}

function todosElementos(seletores, root = document) {
  for (const seletor of seletores) {
    try {
      const els = root.querySelectorAll(seletor);
      if (els.length > 0) return Array.from(els);
    } catch {
      // ignora seletor inválido
    }
  }
  return [];
}

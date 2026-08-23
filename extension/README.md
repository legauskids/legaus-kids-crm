# Extensão Legaus Kids — Atendimento

Extensão de Chrome (Manifest V3) que sincroniza o WhatsApp Web com o CRM. Sem build step — é carregada diretamente via "Load unpacked".

## Instalar

1. `chrome://extensions` → ativar "Modo do desenvolvedor" → "Carregar sem compactação" → selecionar esta pasta (`extension/`).
2. No app, acesse `/extensao`, copie seu token de acesso.
3. Clique no ícone da extensão, cole o token e a URL do sistema (`https://crm.legauskids.com.br` em produção; `http://localhost:3000` só se estiver testando localmente), clique em "Salvar e testar conexão".
4. Abra `web.whatsapp.com` e escaneie o QR code pelo celular normalmente.

## Como funciona

- **WhatsApp → CRM**: o content script observa a conversa aberta no momento (`MutationObserver`) e reporta cada mensagem nova pro backend (`POST /api/integracoes/whatsapp/mensagens`). Só sincroniza o que está sendo exibido na tela — não há acesso a mensagens de conversas fechadas ou chegando com a aba fechada (limitação inerente a ler a UI em vez de uma API real).
- **CRM → WhatsApp**: mensagens digitadas no composer do Atendimento (ou geradas por um agendamento que venceu) ficam numa fila (`GET /api/integracoes/whatsapp/fila-envio`) até serem retransmitidas de verdade. O service worker consulta essa fila a cada 1 minuto (`chrome.alarms`) e manda o content script digitar e enviar na conversa real.

## Diagnóstico

Com a extensão carregada e o WhatsApp Web aberto, rode no console (F12):

```js
window.__legausDebug()
```

Mostra quantos elementos cada seletor de `selectors.js` encontrou no DOM atual. Zero em alguma linha = esse seletor mudou e precisa ser ajustado — é o primeiro lugar a olhar se algo parar de sincronizar.

## Painel lateral (side-panel.js)

Painel recolhível injetado à direita do WhatsApp Web (aba "CRM"). Estrutura em telas, navegadas pela trilha de ícones no topo:

- 🏠 **Resumo** — nome/telefone do contato, "Salvar contato no CRM" (com opção de também pré-preencher a tela nativa "Novo contato" do WhatsApp) e o atalho pra Negócios.
- 📝 **Notas** — lista e cria notas internas do contato (mesmas exibidas na aba Atendimento do CRM).
- ⏰ **Lembretes** — cria um lembrete rápido pro usuário logado (aparece no sininho do CRM).
- ⚡ **Respostas rápidas** — lista o banco de respostas do CRM; clicar insere o texto na caixa de mensagem do WhatsApp.
- 🏷️ **Etiquetas** — tags livres por contato (`Contato.tags`, array no Postgres).
- 🧰 **Ferramentas** — Agendar reunião (abre o Google Agenda com um link direto, sem OAuth), Envio em massa (enfileira uma mensagem pendente por número, retransmitida pela fila normal — não manda nada direto pra evitar quebrar no meio de uma navegação), Exportar contatos (baixa um CSV), Borrar mensagens (blur de CSS pra gravar vídeo tutorial), Assistente IA (ainda não implementado, só um aviso "em breve").

Essas telas foram inspiradas no [WaSeller](https://chromewebstore.google.com/detail/waseller-perder-vendas-no/illemhbijpiebjfilfmgebahaakajkpe) (pesquisado via a página da loja + a extensão de verdade logada — mas a UI real deles ficou travada atrás do login próprio, então a lista de funcionalidades da loja foi a referência principal). Todas as rotas de backend novas foram conferidas via curl contra produção; **o clique de verdade dentro do WhatsApp Web (preencher os formulários, clicar em cada botão) ainda não foi testado ao vivo** — feito assim de propósito, a pedido explícito do usuário, pra revisar tudo junto numa sessão seguinte.

## Limitações conhecidas (leia antes de reportar "não funciona")

- **Seletores confirmados contra uma sessão real** (WhatsApp Business Web, 2026-08-22) — `chat-list`, `cell-frame-container`, `conversation-panel-messages`, `conversation-header`, `conversation-info-header-chat-title`, `conversation-compose-box-input`, botão "Enviar", `tail-out` (mensagem enviada) e os `data-testid="conv-msg-{id}"` de cada bolha. **Não confirmado ainda**: `tail-in` (mensagem recebida) foi inferido por simetria com `tail-out`, mas não apareceu numa conversa real durante a inspeção — é o primeiro lugar a checar com `window.__legausDebug()` se mensagens recebidas não estiverem sincronizando.
- **O formato antigo de telefone embutido no `data-id` das mensagens não existe mais** (documentado por ferramentas de terceiros mais antigas como `{true|false}_{telefone}@c.us_{id}` — hoje é só um hash opaco sem telefone). O telefone da conversa aberta agora vem do `aria-label` da caixa de composição quando o contato não tem nome salvo (rápido), ou abrindo o painel "Dados do contato" e lendo a seção `section-about-and-phone-number` quando tem (mais lento e mais frágil, já que mexe na UI — é a parte que mais precisa de atenção em teste real).
- **Envio de mensagem simulando digitação** (`document.execCommand('insertText', ...)`) é historicamente a parte mais frágil desse tipo de integração — o WhatsApp Web varia como reage a eventos sintéticos entre versões. Não foi testado enviando de verdade nesta rodada (só confirmado que o botão "Enviar" existe e o texto pode ser digitado).
- **Antes de ligar a extensão pela primeira vez em produção**, mensagens antigas criadas pelo composer do Atendimento (de antes da extensão existir) vão aparecer todas na fila de envio de uma vez, já que nunca tiveram um `externalId` real. Ou já espera esse "backlog" na primeira sincronização, ou marca essas mensagens antigas como já enviadas direto no banco antes de instalar a extensão pra valer.

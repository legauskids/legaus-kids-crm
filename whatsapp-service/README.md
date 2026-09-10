# Serviço WhatsApp (Baileys) — Legaus Kids

Substitui a extensão de Chrome (`../extension/`) como ponte entre o WhatsApp
e o CRM: conversa com o protocolo real do WhatsApp multi-dispositivo (via
[Baileys](https://github.com/WhiskeySockets/Baileys)) em vez de ler/digitar
na tela do WhatsApp Web. Não precisa de navegador aberto.

Fala com as **mesmas rotas de API** que a extensão já usa
(`app/api/integracoes/whatsapp/mensagens`, `/fila-envio`,
`/confirmar-envio`) — nenhuma mudança foi feita no CRM pra isso funcionar.

## Instalar

```bash
cd whatsapp-service
npm install
cp .env.example .env
```

Edite o `.env`:
- `CRM_API_TOKEN`: copie o token gerado em `/extensao` dentro do CRM (o
  mesmo que a extensão de Chrome usa — pode ser o mesmo token, não precisa
  gerar um novo).
- `CRM_API_URL`: já vem apontando pra produção
  (`https://crm.legauskids.com.br`); só troca se for testar contra o CRM
  rodando localmente.

## Rodar e parear

```bash
npm start
```

Na primeira vez, aparece um QR code no terminal. No WhatsApp Business do
celular: **Configurações → Aparelhos conectados → Conectar um aparelho** e
escaneia.

**QR expirando antes de dar tempo de escanear?** Preencha
`WHATSAPP_PAREAMENTO_TELEFONE` no `.env` com o número do WhatsApp Business
(só dígitos, com DDI) e rode `npm start` de novo — em vez de QR, aparece um
**código de 8 dígitos** no terminal pra digitar no celular em
"Conectar com número de telefone" (mesma tela de "Aparelhos conectados").
Não precisa de câmera nem de escanear nada. O código se renova sozinho a
cada ~50s enquanto não parear — não precisa reiniciar o processo pra pegar
um novo.

**Muitas tentativas seguidas e continua dizendo "não foi possível
conectar"?** O WhatsApp aplica um limite temporário depois de várias
tentativas de pareamento num intervalo curto — se isso acontecer, dá uma
pausa de 10-15 minutos antes de tentar de novo, em vez de ficar gerando
código atrás de código.

**Terminal travado e `Ctrl+C` não fechou o processo?** No Windows, o
processo `node.exe` às vezes fica "fantasma" rodando em segundo plano
mesmo depois de fechar a janela do terminal — abra o Gerenciador de Tarefas,
procure por `node.exe` e finalize manualmente antes de rodar `npm start`
de novo (dois processos rodando ao mesmo tempo com a mesma sessão causam
erros estranhos de conexão). Depois disso a sessão fica salva em `auth/` (criada
automaticamente, **não** commitar essa pasta — já está no `.gitignore`) e
não precisa escanear de novo nos próximos `npm start`, a não ser que
desconecte pelo celular.

Deixe o terminal aberto rodando — é ele que mantém a sincronização ativa.
Se fechar, o WhatsApp para de sincronizar com o CRM até rodar `npm start`
de novo (a extensão de Chrome continua funcionando em paralelo enquanto
isso não estiver 100% validado).

## Como funciona

- **WhatsApp → CRM**: `src/relay-entrada.js` escuta todo evento de mensagem
  nova do Baileys (`messages.upsert`) e reporta pro CRM — tanto mensagem
  recebida quanto mandada (do próprio relay, do celular, ou de qualquer
  outro "aparelho conectado"). Só cobre mensagem de texto simples por
  enquanto, mesmo escopo que a extensão antiga já tinha.
- **CRM → WhatsApp**: `src/relay-saida.js` consulta a fila de envio do CRM
  a cada 5 segundos e manda de verdade pelo Baileys, confirmando o envio
  de volta pro CRM.
- **Reconexão**: se a conexão cair (internet, reinício do WhatsApp etc.),
  reconecta sozinho automaticamente. Só para de tentar se for uma
  desconexão de verdade feita pelo celular (aí precisa parear de novo).

## Rodando em produção (VPS + PM2)

Desde 2026-09-09 este serviço roda 24/7 numa VPS (Hetzner CX23), não mais
no PC de ninguém. Detalhes:

- **PM2** (`pm2 start src/index.js --name whatsapp-service`) mantém o
  processo rodando e reinicia sozinho se cair; `pm2 startup` + `pm2 save`
  garantem que ele volta sozinho mesmo se a VPS inteira reiniciar.
- **Alertas por push (ntfy.sh, sem conta)**: quando algo precisa de
  atenção de verdade (sessão desconectada, ou reconectando há tempo
  demais), o serviço manda uma notificação push pro tópico configurado em
  `NTFY_TOPICO` no `.env`. Instale o app [ntfy](https://ntfy.sh/) no
  celular e inscreva-se nesse mesmo nome de tópico pra receber. Falha
  transitória normal (reconexão que dá certo em segundos) NÃO gera alerta
  — só o que passa de alguns minutos sem resolver sozinho.
- **`scripts/watchdog-externo.sh`** roda via cron a cada poucos minutos,
  fora do processo Node — existe porque o watchdog de dentro do processo
  (`src/index.js`) não detecta o caso do processo inteiro travar (event
  loop bloqueado, nem o próprio `setInterval` do watchdog interno roda
  mais nesse caso). Ele lê `estado-saude.json` (que o processo escreve
  sozinho a cada mudança de conexão) e o status real no PM2; força
  reinício e avisa por ntfy quando necessário. Configurado no `crontab`
  do usuário `root` da VPS (`*/2 * * * * .../scripts/watchdog-externo.sh`).

**Migrar pra uma VPS nova** (se precisar trocar de servidor no futuro):
copia a pasta `whatsapp-service/` inteira — **incluindo a pasta `auth/`**
— pro servidor novo, roda `npm install`, configura o `.env` e sobe com
PM2 de novo. Como a sessão já está pareada, não precisa escanear o QR
code outra vez.

## Diagnóstico

- Mensagem não chega no CRM: confira se o terminal ainda está rodando e
  conectado (`connection: open` no log). Erros de rede aparecem prefixados
  com `[relay-entrada]` ou `[relay-saida]`.
- `CRM_API_TOKEN não configurado`: falta preencher o `.env`.
- Erro 401 nas chamadas: o token do `.env` está errado, expirado, ou foi
  trocado em `/extensao` — gere um novo e atualize o `.env`.

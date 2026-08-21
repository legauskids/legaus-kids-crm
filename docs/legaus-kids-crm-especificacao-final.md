# Legaus Kids — Sistema de Atendimento & CRM via WhatsApp
### Especificação técnica final — pronta para implementação

---

## 1. Visão geral

A **Legaus Kids** é uma fábrica especializada em espaços kids sob medida — playgrounds, kidplays e brinquedos para ambientes internos e externos (Instagram: [@legaus.kids](https://instagram.com/legaus.kids)).

O objetivo é um sistema de atendimento via WhatsApp que reproduz as funções de plataformas white-label do tipo **Waseller/Whaseller** (central de atendimento multi-atendente sobre o WhatsApp), somado a um módulo de **CRM/negócios/tarefas** nos moldes do **Agendor** (funil de vendas) e **ClickUp** (produtividade/tarefas), operável sem sair da tela de conversa.

**Equipe de uso:**
- **Dani** — Atendimento, pré-vendas, pós-vendas
- **Marcos** — Gestão e fechamento

---

## 2. Decisão de arquitetura (confirmada)

**Extensão de navegador (Chrome) sobre o WhatsApp Web/Business** — não a API oficial do WhatsApp Business.

Motivo: evitar o processo de aprovação junto à Meta e o custo por mensagem enviada da API oficial. A empresa hoje usa o **WhatsApp Business (aplicativo)**, sem API configurada.

**Como funciona na prática:** um *content script* roda dentro da aba do WhatsApp Web, lê a interface (DOM) para identificar contatos/mensagens e injeta os elementos da extensão (painel lateral, comandos) por cima da UI original. É a parte mais delicada de manter, pois depende da estrutura interna do WhatsApp Web, que muda com frequência — recomenda-se isolar essa camada de leitura/injeção do restante da lógica de negócio (CRM/tarefas), para que atualizações do WhatsApp Web quebrem o mínimo possível.

**Pendências de infraestrutura para produção real** (fora do escopo desta conversa, ficam para a etapa de implementação):
- Hospedagem do backend + banco de dados
- Domínio
- Publicação da extensão (Chrome Web Store ou instalação manual/interna)
- Contas de acesso para Dani e Marcos

---

## 3. Módulo Atendimento

### 3.1 Estrutura da tela
- Lista de conversas (à esquerda) → conversa ativa (centro) → painel lateral (à direita), **recolhível** (ícone de mostrar/ocultar).
- Clicar em um negócio no painel lateral leva direto à tela do negócio.

### 3.2 Fila de conversas por setor/atendente
- **Setores:** Atendimento/Pré-vendas, Pós-vendas, Gestão.
- Cada conversa tem: setor, atendente responsável (ou `null` = fila), status (`fila` | `atendendo`).
- Filtros na lista de conversas: **Minhas / Fila / Todas** + filtro por setor.
- Indicador visual: selo "Fila" quando não atribuída, ou avatar do atendente responsável.
- Botão **"Assumir conversa"** quando está na fila (atribui ao usuário atual).
- Botão **Transferir** no cabeçalho do chat → popover para mudar setor e/ou atendente, ou devolver à fila.

### 3.3 Respostas rápidas
- Biblioteca **compartilhada** (empresa) + **pessoal** (por atendente).
- Acesso via ícone de raio no campo de mensagem → lista com busca visual, opção de criar nova (título + texto + escopo compartilhada/pessoal) e excluir.
- Clicar em uma resposta insere o texto no campo de mensagem.

### 3.4 Notas internas e mensagens agendadas
- **Notas internas:** aba própria dentro da conversa (separada do histórico de mensagens — não aparece misturada com o que o cliente vê). Cada nota registra autor e data/hora.
- **Mensagens agendadas:** aba própria, listando mensagens programadas (texto + data/hora + status). Duas formas de criar:
  1. Digitar a mensagem no campo normal e clicar no ícone de relógio → escolher data/hora.
  2. Direto na aba Agendadas, botão "+ Nova mensagem agendada" (formulário próprio, sem depender do campo de digitação).
  - Cancelamento individual disponível.

### 3.5 Comandos rápidos no campo de mensagem
Digitar `/` abre um menu de comandos dentro da própria caixa de mensagem:
- `/negócio` — abre mini-formulário para criar negócio a partir da conversa (contato pré-preenchido, título sugerido, funil/etapa, valor, **responsável sugerido automaticamente pelo atendente da conversa**). Opção de já criar uma tarefa de follow-up — isso **abre uma guia dentro da tela do negócio** para criar a tarefa (não um segundo formulário dentro do chat).
- `/tarefa` — criar tarefa vinculada à conversa.
- `/mover` — mudar etapa do funil do negócio vinculado.

---

## 4. Módulo Negócios (CRM)

### 4.1 Funis personalizáveis
Múltiplos funis, cada um com etapas próprias, editáveis:

**Funil de venda:**
Qualificação → Enviar Proposta → Cobrar Retorno → Fechamento → **Ganho** / **Perdido**

**Funil de pós-venda:**
Contrato → Pagamento → Compras → Produção → Entrega → Avaliação

- Possível **criar novos funis** (nome + lista de etapas) e **novas etapas** dentro de um funil já existente, direto no painel.
- **Etapas reordenáveis** por arrastar (drag and drop).

### 4.2 Painel de negócios (Kanban por funil)
- Menu para alternar entre funis.
- Colunas = etapas do funil selecionado; cards = negócios.
- **Arrastar negócio entre etapas** (drag and drop) — com feedback visual (card com opacidade/sombra ao arrastar; coluna de destino destacada).
- **Prazo por etapa (SLA em dias):** campo editável em cada coluna. Se o negócio ficar parado na etapa além do prazo definido, o card fica **vermelho** com aviso "parado além do prazo".

### 4.3 Tela do negócio
Referência visual: tela de negócio do **Agendor**.
- Cabeçalho: nome do contato + negócio, breadcrumb de etapas do funil (clicável para mover), botões de status **Perdido / Ganho** (apenas no funil de venda).
- Guias: **Dados** · **Tarefas** · **Histórico**.
  - **Dados:** valor, responsável, data de início, previsão de fechamento, origem do lead. No funil de pós-venda, campos adicionais aparecem conforme a etapa: progresso de produção (%, preenchido manualmente) e dados de instalação (data agendada + equipe terceirizada).
  - **Tarefas:** lista de tarefas vinculadas + criação rápida.
  - **Histórico:** notas ("o que foi feito e qual o próximo passo") + linha do tempo de atividades (inclusive originadas da conversa no WhatsApp).
- Sidebar: ações rápidas (E-mail, Ligação, Proposta, WhatsApp), valor do negócio, dados resumidos.
- Campos específicos de "sob medida" (metragem do espaço, tipo de ambiente, necessidade de visita técnica) ficam **para uma fase posterior**, após o sistema já estar em uso.

### 4.4 Automações do funil (regras de negócio)

| Gatilho | Ação automática |
|---|---|
| Negócio marcado **Ganho** (funil de venda) | Cria negócio no funil de pós-venda, etapa **Contrato** + tarefa para **Dani**: "Emissão de contrato", prazo 24h |
| Tarefa "Emissão de contrato" concluída | Negócio avança automaticamente para **Pagamento** |
| Pagamento identificado (ação manual "marcar pagamento identificado") | Negócio avança para **Compras** + cria tarefa para **Dani**: "Iniciar compras" |
| Compras → Produção → Entrega | **Movimentação manual** (sem automação de transição) |
| Negócio entra na etapa **Entrega** (produção finalizada) | Cria tarefa para **Dani**: "Agendar instalação" |
| Negócio entra na etapa **Avaliação** (entrega concluída) | Cria tarefa para **Dani**: "Solicitar avaliação do cliente" |

---

## 5. Módulo Tarefas

### 5.1 Visualizações
**Kanban**, **Lista** e **Calendário** — todas respeitando os mesmos filtros.

### 5.2 Colunas do Kanban
A fazer · Em andamento · **Aprovação** · Atrasada (calculada automaticamente pelo prazo, não é um status manual) · Concluída.

- **Arrastar tarefas entre colunas** (drag and drop), com o mesmo padrão visual de feedback do painel de Negócios.

### 5.3 Aprovações
- Tarefa com status "Aprovação" tem campo **descrição** (preenchido por quem cria, explicando o que precisa ser aprovado).
- Botão **"Aprovar"** — ao aprovar, gera um **lembrete** para quem solicitou (campo `requestedBy`), visível no sino de notificações.

### 5.4 Criação de tarefas
- Campos: título, responsável, **negócio vinculado (opcional — permite tarefa avulsa, sem negócio, para si mesmo ou outra pessoa)**, prazo (data **e horário**), status, **descrição (sempre visível, não só em aprovação)**.

### 5.5 Filtros (válidos nas 3 visualizações)
- Responsável
- Etapa do negócio vinculado (por funil)
- **Status da tarefa** (a fazer / em andamento / aprovação / atrasada / concluída) — **com contagem ao lado de cada opção**
- Período: Hoje / Semana / Mês

### 5.6 Cores dos cards (por prazo)
- **Branco** — no prazo
- **Azul claro** — vence hoje
- **Vermelho** — atrasada

---

## 6. Painel de Produção & Instalações

Duas frentes, também refletidas dentro da tela do negócio (aba Dados):
- **Em produção:** projetos sendo fabricados, com **progresso manual (%)**.
- **Instalações:** data agendada + equipe (as equipes de instalação são **terceirizadas**).
- Visualizações: **Painel** (listas) e **Calendário** (previsão de produção 🔧 + instalação agendada 🚚).

---

## 7. Dashboard (Painel do gestor)

Tela inicial do sistema — visão geral objetiva ao abrir o sistema, inspirada em padrões de dashboards de CRM consolidados (KPIs, funil, alertas, agenda, desempenho de equipe).

- **KPIs:** em negociação (R$), ganhos no mês (R$ + qtd), taxa de conversão, ticket médio, negócios parados (SLA estourado), tarefas atrasadas, aprovações pendentes.
- **Meta do mês:** barra de progresso (R$ ganho vs. meta), meta editável. Resumo compacto no dashboard; **ao expandir**, detalhamento por semana, por responsável e lista de negócios ganhos.
- **Funil de vendas (mini):** barras por etapa (quantidade + valor).
- **Agenda de hoje:** tarefas do dia + instalações do dia, com atalho para o painel de Tarefas.
- **Precisa da sua atenção:** lista unificada de negócios parados, aprovações pendentes e tarefas atrasadas.
- **Produção:** projetos em andamento, progresso médio, instalações da semana.
- **Equipe:** desempenho por responsável (ganhos do mês, tarefas concluídas/atrasadas).
- **Expandir:** todos os painéis relevantes têm botão de expandir para visão detalhada em tela cheia.

---

## 8. Modelo de dados (entidades principais)

```
Usuário         { id, nome, papel }
Setor           { id, nome }
Contato         { id, nome, empresa, telefone }
Conversa        { contatoId, setor, atendenteId, status, mensagens[], notas[], agendadas[] }
Funil           { id, nome, etapas: [{ id, nome, terminal?, slaDias? }] }
Negócio         { id, título, contatoId, funilId, etapaId, valor, responsávelId,
                  dataInício, dataEntradaNaEtapa, previsãoFechamento, origem,
                  progressoProdução?, dataInstalação?, equipeInstalação?, motivoPerda? }
Tarefa          { id, título, negócioId?, contatoId?, responsávelId, solicitanteId,
                  prazo, horário, status, descrição, automática? }
Lembrete        { id, paraUsuárioId, texto, tarefaId, lido? }
RespostaRápida  { id, título, texto, escopo (compartilhada|pessoal), donoId? }
Atividade       { id, negócioId, tipo (nota|whatsapp|sistema), texto, autor, data }
Meta            { valorAlvoMensal }
```

---

## 9. Status do protótipo

Um protótipo funcional interativo (React, com persistência de dados) foi validado ao longo desta conversa, cobrindo **todas** as funcionalidades listadas acima. Ele serve como referência de comportamento e UX para a implementação real — inclusive a lógica das automações já foi testada e ajustada nele.

**O que falta para produção real** (fora do alcance desta conversa/ambiente):
1. Construção da extensão de Chrome de verdade (manifest, content script, leitura da UI do WhatsApp Web).
2. Backend + banco de dados reais (hoje os dados do protótipo ficam associados à sessão de teste).
3. Hospedagem, domínio e publicação/distribuição da extensão.
4. Contas de acesso reais para Dani e Marcos.

**Caminho recomendado:** seguir com **Claude Code**, que tem acesso real à internet e às ferramentas de desenvolvimento/deploy, usando este documento como especificação de partida.

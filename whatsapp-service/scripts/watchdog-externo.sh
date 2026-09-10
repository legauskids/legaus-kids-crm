#!/bin/bash
# Watchdog EXTERNO — roda via cron, fora do processo Node.
#
# Por quê: o watchdog de dentro do processo (src/index.js) detecta conexão
# "zumbi" (socket vivo mas travado), mas não cobre o caso do processo
# inteiro travar (event loop bloqueado) — nesse caso nem o próprio
# setInterval do watchdog interno roda mais. Este script lê o estado que o
# processo escreve sozinho a cada mudança de conexão (estado-saude.json) e
# o status real reportado pelo PM2; se alguma das duas coisas não bater com
# "tudo bem", força reinício e avisa por ntfy — throttlado pra não virar
# spam de notificação repetida enquanto o problema não é resolvido.
set -u

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARQUIVO_ESTADO="$DIR/estado-saude.json"
ARQUIVO_ENV="$DIR/.env"
ARQUIVO_ULTIMO_ALERTA="$DIR/.ultimo-alerta-watchdog"
MINUTOS_LIMITE_RECONECTANDO=6
MINUTOS_ENTRE_ALERTAS_REPETIDOS=30

NTFY_TOPICO=$(grep -E '^NTFY_TOPICO=' "$ARQUIVO_ENV" 2>/dev/null | cut -d= -f2-)

avisar() {
  local titulo="$1" mensagem="$2" prioridade="${3:-default}" tag="${4:-warning}"
  [ -z "$NTFY_TOPICO" ] && return 0
  curl -s -X POST "https://ntfy.sh/$NTFY_TOPICO" \
    -H "Title: $titulo" -H "Priority: $prioridade" -H "Tags: $tag" \
    -H "Content-Type: text/plain; charset=utf-8" \
    --data-binary "$mensagem" >/dev/null
}

ja_alertou_recente() {
  local tipo="$1"
  [ -f "$ARQUIVO_ULTIMO_ALERTA" ] || return 1
  local linha
  linha=$(grep "^$tipo:" "$ARQUIVO_ULTIMO_ALERTA" 2>/dev/null | tail -1)
  [ -z "$linha" ] && return 1
  local quando_epoch=${linha#*:}
  local diff_min=$(( ($(date +%s) - quando_epoch) / 60 ))
  [ "$diff_min" -lt "$MINUTOS_ENTRE_ALERTAS_REPETIDOS" ]
}

marcar_alertado() {
  local tipo="$1"
  { [ -f "$ARQUIVO_ULTIMO_ALERTA" ] && grep -v "^$tipo:" "$ARQUIVO_ULTIMO_ALERTA"; echo "$tipo:$(date +%s)"; } > "$ARQUIVO_ULTIMO_ALERTA.tmp" 2>/dev/null
  mv "$ARQUIVO_ULTIMO_ALERTA.tmp" "$ARQUIVO_ULTIMO_ALERTA"
}

limpar_alerta() {
  local tipo="$1"
  [ -f "$ARQUIVO_ULTIMO_ALERTA" ] || return 0
  grep -v "^$tipo:" "$ARQUIVO_ULTIMO_ALERTA" > "$ARQUIVO_ULTIMO_ALERTA.tmp" 2>/dev/null || true
  mv "$ARQUIVO_ULTIMO_ALERTA.tmp" "$ARQUIVO_ULTIMO_ALERTA" 2>/dev/null || true
}

STATUS_PM2=$(pm2 jlist 2>/dev/null | jq -r '.[] | select(.name=="whatsapp-service") | .pm2_env.status' 2>/dev/null)

if [ -z "$STATUS_PM2" ] || [ "$STATUS_PM2" != "online" ]; then
  if ! ja_alertou_recente "processo_caido"; then
    avisar "WhatsApp Legaus Kids: processo caiu" "PM2 reporta status '$STATUS_PM2' (esperado: online). Tentando reiniciar sozinho agora." "urgent" "rotating_light"
    marcar_alertado "processo_caido"
  fi
  pm2 restart whatsapp-service >/dev/null 2>&1 || pm2 resurrect >/dev/null 2>&1
  exit 0
fi
limpar_alerta "processo_caido"

[ -f "$ARQUIVO_ESTADO" ] || exit 0

STATUS=$(jq -r '.status' "$ARQUIVO_ESTADO" 2>/dev/null)
EM=$(jq -r '.em' "$ARQUIVO_ESTADO" 2>/dev/null)
EM_EPOCH=$(date -d "$EM" +%s 2>/dev/null || echo 0)
DIFF_MIN=$(( ($(date +%s) - EM_EPOCH) / 60 ))

case "$STATUS" in
  conectado)
    limpar_alerta "reconectando_travado"
    limpar_alerta "desconectado_permanente"
    ;;
  desconectado_permanente)
    if ! ja_alertou_recente "desconectado_permanente"; then
      avisar "WhatsApp Legaus Kids desconectado" "Sessão desconectada, precisa parear de novo (ver README). Alerta repetido porque ainda não foi resolvido." "urgent" "rotating_light"
      marcar_alertado "desconectado_permanente"
    fi
    ;;
  reconectando)
    if [ "$DIFF_MIN" -ge "$MINUTOS_LIMITE_RECONECTANDO" ]; then
      if ! ja_alertou_recente "reconectando_travado"; then
        avisar "WhatsApp Legaus Kids: reconectando há tempo demais" "Tentando reconectar há mais de $MINUTOS_LIMITE_RECONECTANDO min sem sucesso. Reiniciando o processo agora pra forçar uma conexão limpa." "high" "warning"
        marcar_alertado "reconectando_travado"
      fi
      pm2 restart whatsapp-service >/dev/null 2>&1
    fi
    ;;
esac

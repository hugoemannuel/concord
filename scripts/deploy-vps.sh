#!/usr/bin/env bash
# Atualiza o servidor da Salinha numa VPS (Debian/Ubuntu com Docker e Caddy).
#
#   scripts/deploy-vps.sh root@IP
#   scripts/deploy-vps.sh --infra root@IP   # aplica mudanças do Postgres/LiveKit
#
# Envia o backend (binário Linux), migrations, docker-compose.yml, a página
# de download (site/), o app web (frontend/dist-web, gerado por
# `yarn build:web`) e as atualizações do app (backend/updates, geradas por
# release-win.sh/release-linux.sh: instaladores, AppImage, .tar.gz do Linux e
# manifestos) para /opt/concord, os source maps do renderer (frontend/sourcemaps,
# gerados pelos builds; ficam em /opt/concord/sourcemaps, fora do que o Caddy
# serve, e os de mais de 90 dias são apagados), garante o ffmpeg e o yt-dlp do Maestro (bot de
# música; binário oficial + timer diário de atualização) e reinicia o backend.
# O site/install.sh vai com a chave pública de backend/.release-key embutida.
# Reiniciar não derruba chamadas: o backend recarrega as chamadas ativas, e a
# mídia e a sinalização (/rtc, que o Caddy manda direto para o LiveKit —
# deploy/Caddyfile) seguem no LiveKit. O Caddyfile da VPS não é enviado (use
# scripts/apply-caddyfile.sh). O .env da VPS (/opt/concord/.env) só recebe as
# variáveis de SYNCED_ENV (abaixo) que vierem preenchidas no ambiente do
# deploy; o resto dele não é tocado.
# A mídia do chat (/opt/concord/uploads) nunca é enviada nem apagada.
#
# Nada que está no ar é trocado antes de o binário novo passar nas checagens:
# binário, migrations e página de download vão para nomes .new e só substituem
# os atuais depois das migrations (binário) ou do /healthz (página, app web e
# manifestos do app).
#
# Postgres e LiveKit nunca são recriados num deploy normal: recriar o LiveKit
# derruba todas as chamadas (as salas só existem na memória dele). Se o
# docker-compose.yml (ou o .env que ele usa) mudou algo que exigiria recriar
# um deles, o deploy avisa, mantém o compose antigo e segue só com o backend.
# Para aplicar, rode de novo com --infra quando ninguém estiver em chamada.
#
# Variáveis (para testes): CONCORD_REMOTE_DIR (padrão /opt/concord),
# HEALTH_TIMEOUT (segundos de espera pelo /healthz, padrão 30).
set -euo pipefail

INFRA=0
HOST=""
for arg in "$@"; do
  case "$arg" in
    --infra) INFRA=1 ;;
    -*) echo "opção desconhecida: $arg" >&2; exit 1 ;;
    *) HOST="$arg" ;;
  esac
done
if [[ -z "$HOST" ]]; then
  echo "uso: $0 [--infra] usuario@servidor" >&2
  exit 1
fi
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="${CONCORD_REMOTE_DIR:-/opt/concord}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-30}"
BIN="$(mktemp)"
SITE="$(mktemp -d)"
trap 'rm -rf "$BIN" "$SITE"' EXIT

# Página de download com a chave pública embutida no install.sh: o instalador
# confere a assinatura Ed25519 do pacote já na primeira instalação.
KEY="$ROOT/backend/.release-key"
cp -a "$ROOT/site/." "$SITE/"
if [[ -f "$KEY" ]]; then
  openssl pkey -in "$KEY" -pubout >"$SITE/.release-key.pub"
  "$ROOT/scripts/embed-pubkey.sh" "$ROOT/site/install.sh" "$SITE/.release-key.pub" "$SITE/install.sh"
  rm -f "$SITE/.release-key.pub"
elif [[ -n "${GITHUB_ACTIONS:-}" ]]; then
  echo "chave de assinatura ausente em $KEY: install.sh ficaria sem a chave pública" >&2
  exit 1
else
  echo "aviso: $KEY não existe — install.sh vai sem a chave (só HTTPS + sha512)" >&2
fi

# Roda um script bash no servidor com variáveis. O ssh junta os argumentos num
# texto só (um argumento vazio some), então os valores vão como VAR=valor já
# citados, nunca como $1/$2.
remote() {
  local assigns="" kv
  for kv in "$@"; do
    assigns+="${kv%%=*}=$(printf '%q' "${kv#*=}") "
  done
  ssh "$HOST" "${assigns}bash -s"
}
q() { printf '%q' "$1"; }

(cd "$ROOT/backend" && GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -o "$BIN" ./cmd)
ssh "$HOST" "mkdir -p $(q "$DIR/updates") $(q "$DIR/uploads") $(q "$DIR/web") $(q "$DIR/sourcemaps")"
rsync -az "$BIN" "$HOST:$DIR/concord-server.new"
rsync -az --delete "$ROOT/backend/migrations/" "$HOST:$DIR/migrations.new/"
# O compose novo só substitui o atual se não recriar nada (ver abaixo).
rsync -az "$ROOT/backend/docker-compose.yml" "$HOST:$DIR/docker-compose.yml.new"
rsync -az --delete --chmod=D755,F644 "$SITE/" "$HOST:$DIR/site.new/"
# Instaladores e assinaturas já (arquivos novos, com a versão no nome); os
# manifestos (latest*.yml) só depois que o backend novo estiver no ar. O Caddy
# serve /updates direto do disco, então os arquivos precisam ser legíveis.
if [[ -d "$ROOT/backend/updates" ]]; then
  rsync -az --chmod=D755,F644 --exclude latest.yml --exclude latest-linux.yml --exclude latest-linux-tar.yml "$ROOT/backend/updates/" "$HOST:$DIR/updates/"
fi
# Source maps do renderer (docs/adr/0068): o backend traduz com eles a pilha
# dos erros do app (SOURCEMAPS_DIR). Só o backend lê; o Caddy não serve esta
# pasta. Sem --delete: quem ainda não atualizou continua mandando erros da
# versão antiga. Os de mais de 90 dias saem.
if [[ -d "$ROOT/frontend/sourcemaps" ]]; then
  rsync -az --chmod=D755,F644 "$ROOT/frontend/sourcemaps/" "$HOST:$DIR/sourcemaps/"
fi
ssh "$HOST" "find $(q "$DIR/sourcemaps") -type f -name '*.map' -mtime +90 -delete"

# Postgres/LiveKit: compara o hash da configuração nova de cada serviço (o que
# o Compose usa para decidir recriar) com o dos containers rodando.
remote DIR="$DIR" INFRA="$INFRA" CI="${GITHUB_ACTIONS:-}" <<'REMOTE'
set -euo pipefail
cd "$DIR"
running=$(for id in $(docker compose -f docker-compose.yml.new ps -aq); do
  docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}} {{index .Config.Labels "com.docker.compose.config-hash"}}' "$id"
done)
changed=""
while read -r service hash; do
  [[ -z "$service" ]] && continue
  current=$(awk -v s="$service" '$1 == s { print $2 }' <<<"$running")
  if [[ -n "$current" && "$current" != "$hash" ]]; then
    changed="$changed $service"
  fi
done < <(docker compose -f docker-compose.yml.new config --hash '*')

if [[ -n "$changed" && "$INFRA" != 1 ]]; then
  msg="docker-compose.yml/.env mudou:$changed. NÃO recriei (derrubaria as chamadas). Rode scripts/deploy-vps.sh --infra quando ninguém estiver em chamada."
  if [[ -n "$CI" ]]; then echo "::warning::$msg"; else echo "AVISO: $msg" >&2; fi
  rm -f docker-compose.yml.new
else
  mv docker-compose.yml.new docker-compose.yml
  if [[ -n "$changed" ]]; then
    echo "--infra: recriando$changed (as chamadas em andamento caem)."
    docker compose pull --quiet
    docker compose up -d
  fi
fi
# Sobe o que estiver parado ou faltando, sem recriar o que já roda.
docker compose up -d --no-recreate
REMOTE

# Alertas das unidades do systemd (docs/adr/0071): instala o modelo
# concord-alerta@.service e, em cada concord-*/salinha-*.service da VPS (menos
# o próprio concord-server, que avisa quando volta), um complemento
# <unidade>.d/alerta.conf com OnFailure=concord-alerta@%n.service. Não toca no
# arquivo das unidades; o que já tem o OnFailure no próprio arquivo fica como
# está. Idempotente: só grava e recarrega o systemd se algo mudou. Falha aqui
# só avisa (o deploy segue). SYSTEMD_DIR existe para testes.
remote SYSTEMD_DIR="${CONCORD_SYSTEMD_DIR:-/etc/systemd/system}" ALERT_UNIT="$(cat "$ROOT/deploy/concord-alerta@.service")" <<'REMOTE'
set -euo pipefail
setup_alerts() {
  local changed=0 f unit dropin want
  mkdir -p "$SYSTEMD_DIR"
  f="$SYSTEMD_DIR/concord-alerta@.service"
  if [[ "$(cat "$f" 2>/dev/null || true)" != "$ALERT_UNIT" ]]; then printf '%s\n' "$ALERT_UNIT" >"$f"; changed=1; fi
  want=$'# Gerado pelo scripts/deploy-vps.sh: falhou, avisa em #alertas (docs/adr/0071).\n[Unit]\nOnFailure=concord-alerta@%n.service'
  for f in "$SYSTEMD_DIR"/concord-*.service "$SYSTEMD_DIR"/salinha-*.service; do
    [[ -f "$f" ]] || continue
    unit="${f##*/}"
    [[ "$unit" == concord-server.service || "$unit" == concord-alerta@.service ]] && continue
    grep -q '^OnFailure=concord-alerta@' "$f" && continue
    dropin="$f.d/alerta.conf"
    if [[ "$(cat "$dropin" 2>/dev/null || true)" != "$want" ]]; then
      mkdir -p "$f.d"
      printf '%s\n' "$want" >"$dropin"
      changed=1
    fi
  done
  if ((changed)); then systemctl daemon-reload; fi
}
if (setup_alerts); then
  echo "Alertas: OnFailure das unidades do systemd em dia"
else
  echo "AVISO: não consegui instalar os alertas das unidades do systemd (o deploy segue)" >&2
fi
REMOTE

# Dependências do Maestro (bot de música): ffmpeg e yt-dlp no PATH do servidor.
# O backend só os procura ao subir (exec.LookPath); sem eles ele funciona
# normalmente e o Maestro responde "fora do ar". Por isso isto roda ANTES de
# reiniciar o concord-server. Idempotente: o que já existe não é tocado. O
# yt-dlp é o binário oficial (o do apt fica velho e o `yt-dlp -U` não funciona
# nele), mantido por um timer diário do systemd (o YouTube muda com frequência
# e quebra versões antigas). Sem ffmpeg o deploy falha; o timer do yt-dlp é só
# conveniência e nunca derruba o deploy. SYSTEMD_DIR existe para testes.
remote SYSTEMD_DIR="${CONCORD_SYSTEMD_DIR:-/etc/systemd/system}" <<'REMOTE'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt_updated=0
apt_install() {
  if ((apt_updated == 0)); then apt-get update -qq; apt_updated=1; fi
  apt-get install -y -qq "$@"
}

if command -v ffmpeg >/dev/null 2>&1; then
  echo "Maestro: ffmpeg já instalado"
else
  echo "Maestro: instalando ffmpeg..."
  if ! apt_install ffmpeg || ! command -v ffmpeg >/dev/null 2>&1; then
    echo "ERRO: não consegui instalar o ffmpeg (o Maestro precisa dele)" >&2
    exit 1
  fi
fi

if command -v yt-dlp >/dev/null 2>&1; then
  echo "Maestro: yt-dlp já instalado"
else
  echo "Maestro: instalando yt-dlp (binário oficial)..."
  command -v python3 >/dev/null 2>&1 || apt_install python3
  tmp=$(mktemp /usr/local/bin/.yt-dlp.XXXXXX)
  if curl -fsSL --retry 3 -o "$tmp" https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp; then
    chmod a+rx "$tmp"
    mv -f "$tmp" /usr/local/bin/yt-dlp
  else
    rm -f "$tmp"
    echo "ERRO: não consegui baixar o yt-dlp (o Maestro precisa dele)" >&2
    exit 1
  fi
fi

# Atualização diária do yt-dlp. Falha aqui só avisa.
setup_timer() {
  local changed=0 f want
  mkdir -p "$SYSTEMD_DIR"
  want=$'[Unit]\nDescription=Atualiza o yt-dlp (Maestro do Concord)\nOnFailure=concord-alerta@%n.service\n\n[Service]\nType=oneshot\nExecStart=/usr/local/bin/yt-dlp -U\n'
  f="$SYSTEMD_DIR/concord-ytdlp-update.service"
  if [[ "$(cat "$f" 2>/dev/null || true)" != "${want%$'\n'}" ]]; then printf '%s' "$want" >"$f"; changed=1; fi
  want=$'[Unit]\nDescription=Atualiza o yt-dlp todo dia (Maestro do Concord)\n\n[Timer]\nOnCalendar=daily\nPersistent=true\n\n[Install]\nWantedBy=timers.target\n'
  f="$SYSTEMD_DIR/concord-ytdlp-update.timer"
  if [[ "$(cat "$f" 2>/dev/null || true)" != "${want%$'\n'}" ]]; then printf '%s' "$want" >"$f"; changed=1; fi
  if ((changed)); then systemctl daemon-reload; fi
  systemctl enable --now concord-ytdlp-update.timer
}
if (setup_timer); then
  echo "Maestro: timer diário de atualização do yt-dlp ativo"
else
  echo "AVISO: não consegui configurar o timer de atualização do yt-dlp (o deploy segue)" >&2
fi
REMOTE

# Configuração que o deploy grava no .env da VPS (no Actions, vem dos Secrets;
# veja docs/HOSPEDAGEM.md). Só entra o que vier preenchido: variável vazia ou
# ausente deixa a linha do .env como está. Roda antes do restart abaixo, que é
# quando o backend lê o .env. Os valores só podem ter caracteres seguros, para
# um secret mal colado não injetar linhas no .env.
SYNCED_ENV=(TECH_TEAM_USER_IDS CHANGELOG_TOKEN)
for name in "${SYNCED_ENV[@]}"; do
  value="${!name:-}"
  [[ -n "$value" ]] || continue
  if [[ ! "$value" =~ ^[A-Za-z0-9,._:/@+-]+$ ]]; then
    echo "ERRO: $name tem caracteres que não podem ir para o .env (só letras, números e , . _ : / @ + -); nada foi alterado" >&2
    exit 1
  fi
  remote DIR="$DIR" NAME="$name" VALUE="$value" <<'REMOTE'
set -euo pipefail
cd "$DIR"
touch .env
tmp=$(mktemp .env.XXXXXX)
# Troca a linha NOME=... (a primeira; repetidas somem) ou acrescenta no fim.
awk -v name="$NAME" -v value="$VALUE" '
  $0 ~ "^(export[ \t]+)?" name "=" { if (!done) print name "=" value; done = 1; next }
  { print }
  END { if (!done) print name "=" value }
' .env >"$tmp"
chmod --reference=.env "$tmp"
chown --reference=.env "$tmp" 2>/dev/null || true
mv "$tmp" .env
echo "$NAME gravado no .env da VPS"
REMOTE
done

# Checa o binário novo e aplica as migrations novas ANTES de reiniciar, com o
# antigo ainda no ar (por isso as migrations precisam ser compatíveis com ele —
# veja "Migrations" em docs/HOSPEDAGEM.md). Se algo falhar aqui, nada que está
# no ar foi trocado. Depois reinicia e espera o /healthz (banco no ar e
# chamadas recarregadas) por até HEALTH_TIMEOUT segundos, contados no relógio.
#
# Se o binário novo não ficar saudável, volta sozinho para o último que ficou
# (concord-server.good), reinicia e sai com erro — a página, o app web e os
# manifestos não são publicados. concord-server.prev é sempre um binário que já
# passou no /healthz; o que falhou fica em concord-server.failed.
remote DIR="$DIR" HEALTH_TIMEOUT="$HEALTH_TIMEOUT" <<'REMOTE'
set -euo pipefail
cd "$DIR"
CAPABILITY=concord-capability:socket-activation-v1

# O socket conta como em uso se está ativo, se está habilitado ou se o arquivo
# existe: parado (manutenção), o restart o traz de volta pelo Wants= do
# serviço, e um binário sem suporte a ele não subiria (porta ocupada).
socket_active() {
  systemctl is-active -q concord-server.socket 2>/dev/null ||
    systemctl is-enabled -q concord-server.socket 2>/dev/null ||
    [[ -e /etc/systemd/system/concord-server.socket ]]
}
# Com o socket do systemd, a porta é a dele (o backend ignora o PORT do .env).
if socket_active; then
  listen=$(systemctl show -p Listen --value concord-server.socket 2>/dev/null | awk '{print $1}')
  port="${listen##*:}"
else
  port=$(sed -n -E 's/^(export[[:space:]]+)?PORT=//p' .env | tail -n 1 | sed -E 's/[[:space:]]+#.*$//' | tr -d "\"' \r")
fi
port="${port:-8080}" # mesmo padrão do backend
supports_socket() { grep -aq "$CAPABILITY" "$1"; }

# Espera o backend responder até o prazo (relógio, não número de tentativas:
# com o socket a conexão nunca é recusada e cada curl espera o tempo dele).
# wait_status 200: /healthz ok. wait_status 200 404: no ar, mesmo sem /healthz
# (binário de antes desta versão). Escreve o código que chegou.
wait_status() {
  local end=$((SECONDS + HEALTH_TIMEOUT)) code
  while ((SECONDS < end)); do
    code=$(curl -s -m 1 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/healthz" || true)
    for want in "$@"; do
      [[ "$code" == "$want" ]] && { echo "$code"; return 0; }
    done
    sleep 0.3
  done
  return 1
}
restart() {
  # Um crash loop anterior pode ter deixado o serviço em start-limit-hit.
  systemctl reset-failed concord-server 2>/dev/null || true
  systemctl restart concord-server
}

chmod +x concord-server.new
if socket_active && ! supports_socket concord-server.new; then
  rm -f concord-server.new
  rm -rf migrations.new site.new
  echo "ERRO: o concord-server.socket está ativo (ou habilitado) e este binário não sabe usá-lo (não subiria: porta ocupada)." >&2
  echo "      Nada foi trocado. Para instalar uma versão antiga, desative o socket antes (docs/HOSPEDAGEM.md, \"Voltar a uma versão antiga\")." >&2
  exit 1
fi
if ! MIGRATIONS_DIR=migrations.new timeout 120 ./concord-server.new migrate; then
  rm -f concord-server.new
  rm -rf migrations.new site.new
  echo "ERRO: migrations falharam; nada que está no ar foi trocado" >&2
  exit 1
fi
# Migrations aplicadas: a pasta nova passa a valer (o binário no ar só as lê
# ao subir).
rm -rf migrations.old
if [[ -d migrations ]]; then mv migrations migrations.old; fi
mv migrations.new migrations
rm -rf migrations.old

# O que está no ar agora só vira o "anterior" se já tiver passado no /healthz.
if [[ -f concord-server.good ]]; then
  cp -f concord-server.good concord-server.prev
elif [[ -f concord-server ]]; then
  cp -f concord-server concord-server.prev # primeiro deploy com este script
fi
mv concord-server.new concord-server
restart
if wait_status 200 >/dev/null; then
  cp -f concord-server concord-server.good
  echo "backend no ar (/healthz ok)"
  exit 0
fi

echo "ERRO: o backend novo não respondeu /healthz em ${HEALTH_TIMEOUT} s:" >&2
journalctl -u concord-server -n 30 --no-pager >&2 || true
mv -f concord-server concord-server.failed
rm -rf site.new
if [[ ! -f concord-server.prev ]]; then
  echo "ERRO: não há binário anterior para voltar; o backend está fora do ar" >&2
  exit 1
fi
if socket_active && ! supports_socket concord-server.prev; then
  echo "ERRO: o binário anterior não sabe usar o socket ativo; não dá para voltar sozinho." >&2
  echo "      O backend está fora do ar: veja \"Voltar a uma versão antiga\" em docs/HOSPEDAGEM.md." >&2
  exit 1
fi
cp -f concord-server.prev concord-server
restart
# Uma espera só (até HEALTH_TIMEOUT): 200 é um binário com /healthz, 404 um de
# antes dele (o primeiro deploy com este script), que também está no ar.
case "$(wait_status 200 404 || true)" in
  200) echo "ERRO: voltei para o binário anterior, que está no ar. O novo ficou em $DIR/concord-server.failed." >&2 ;;
  404) echo "ERRO: voltei para o binário anterior, que está no ar (é de antes do /healthz). O novo ficou em $DIR/concord-server.failed." >&2 ;;
  *) echo "ERRO: o binário anterior também não respondeu em ${HEALTH_TIMEOUT} s; veja journalctl -u concord-server" >&2 ;;
esac
exit 1
REMOTE

# Backend novo no ar: só agora a página de download, o app web e os apps
# desktop passam a ver a versão nova (o app web novo pode depender da API nova).
remote DIR="$DIR" <<'REMOTE'
set -euo pipefail
cd "$DIR"
rm -rf site.old
if [[ -d site ]]; then mv site site.old; fi
mv site.new site
rm -rf site.old
REMOTE
# App web: os assets (nomes com hash) antes, o index.html por último — quem
# abrir no meio do envio não pega um index apontando para arquivo que falta.
# O --delete só limpa /opt/concord/web.
WEB="$ROOT/frontend/dist-web"
if [[ -f "$WEB/index.html" ]]; then
  rsync -az --chmod=D755,F644 --exclude index.html "$WEB/" "$HOST:$DIR/web/"
  rsync -az --delete --chmod=D755,F644 "$WEB/" "$HOST:$DIR/web/"
else
  echo "aviso: $WEB não existe (rode 'yarn build:web' em frontend/) — app web não atualizado" >&2
fi
for manifest in latest.yml latest-linux-tar.yml latest-linux.yml; do
  if [[ -f "$ROOT/backend/updates/$manifest" ]]; then
    rsync -az --chmod=F644 "$ROOT/backend/updates/$manifest" "$HOST:$DIR/updates/"
  fi
done
# Guarda só os arquivos que os manifests atuais citam (instalador, .blockmap e
# .sig de cada sistema): versões antigas não servem para nada, já que o app
# sempre baixa a mais nova. Concord-* é o nome antigo do app.
remote DIR="$DIR" <<'REMOTE'
set -euo pipefail
cd "$DIR/updates"
keep=$(grep -hE '^[[:space:]]*(-[[:space:]]*)?(url|path):' latest*.yml 2>/dev/null | sed -E 's/.*:[[:space:]]*//' | sort -u || true)
[[ -n "$keep" ]] || exit 0
for f in Salinha-* Concord-*; do
  [[ -e "$f" ]] || continue
  base=${f%.sig}; base=${base%.blockmap}
  grep -qxF "$base" <<<"$keep" || rm -f -- "$f"
done
REMOTE

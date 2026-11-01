#!/usr/bin/env bash
# Gera o .env de um servidor novo da Salinha, com segredos fortes que nunca
# aparecem na tela, e troca linhas dele depois sem estragar o arquivo.
#
#   scripts/make-env.sh --vps https://1-2-3-4.sslip.io /opt/concord/.env
#   scripts/make-env.sh --pc  http://abc.gl.at.ply.gg:12345 backend/.env
#   scripts/make-env.sh --set SMTP_PASS='senha com espaço' /opt/concord/.env
#
# Não depende do resto do repositório: dá para rodar na VPS mandando pelo ssh:
#   ssh root@IP 'bash -s -- --vps https://1-2-3-4.sslip.io /opt/concord/.env' < scripts/make-env.sh
#
# --vps: backend só em 127.0.0.1:8090, atrás do Caddy (deploy/Caddyfile.modelo)
#        e LIVEKIT_NODE_IP vazio (preenchido, só quem tem IPv6 entra na call).
# --pc:  PC de casa com playit (docs/HOSPEDAGEM.md, seções 2 e 3); depois
#        ponha as portas dos túneis e o IP do playit com --set.
# Nunca sobrescreve um .env que já existe: segredos novos derrubariam o login
# de todo mundo. As outras variáveis (opcionais) estão no backend/.env.example.
# Guia completo: docs/ai/servidor-proprio.md.
set -euo pipefail

die() { echo "ERRO: $*" >&2; exit 1; }

secret() { openssl rand -hex 32; }

# Valor como o godotenv e o docker compose leem: puro se só tem caracteres
# seguros; entre aspas simples (literal) se tiver espaço, #, & etc.
quote() {
  local value="$1"
  if [[ "$value" == *$'\n'* || "$value" == *$'\r'* ]]; then die "o valor não pode ter quebra de linha"; fi
  if [[ "$value" =~ ^[A-Za-z0-9,._:/@+-]*$ ]]; then printf '%s' "$value"; return; fi
  if [[ "$value" == *"'"* ]]; then die "o valor não pode ter aspas simples (')"; fi
  printf "'%s'" "$value"
}

generate() {
  local mode="$1" url="${2%/}" file="$3" host port
  [[ "$url" =~ ^https?://[^/[:space:]]+$ ]] || die "o endereço precisa ser http(s)://algo, sem caminho (recebido: $2)"
  [[ ! -e "$file" ]] || die "$file já existe; não mexi (segredos novos derrubariam o login de todo mundo). Para trocar uma linha: --set"
  if [[ "$mode" == vps ]]; then host=127.0.0.1 port=8090; else host="" port=8080; fi
  mkdir -p "$(dirname "$file")"
  (
    umask 077
    cat >"$file" <<EOF
# Gerado por scripts/make-env.sh ($mode). Segredo: não mostre nem commite.
# Opcionais (e-mail, GIFs, Spotify, push): veja backend/.env.example.
HOST=$host
PORT=$port
POSTGRES_PORT=5432
DATABASE_URL=postgres://concord-user:concord-password@localhost:5432/concord?sslmode=disable
JWT_SECRET=$(secret)
LIVEKIT_API_KEY=concord
LIVEKIT_API_SECRET=$(secret)
LIVEKIT_PORT=7880
LIVEKIT_TCP_PORT=7881
LIVEKIT_UDP_PORT=7882
LIVEKIT_NODE_IP=
LIVEKIT_PROMETHEUS_PORT=6789
PUBLIC_URL=$url
API_PUBLIC_URL=$url
APP_URL=$url
UPDATES_DIR=updates
UPLOADS_MIN_FREE_GB=5
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
MAIL_FROM=
GIPHY_API_KEY=
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
EOF
  )
  echo "Gravei $file ($mode, endereço $url). Os segredos foram gerados e não aparecem aqui."
  if [[ "$mode" == pc ]]; then
    echo "Falta (playit): LIVEKIT_UDP_PORT e LIVEKIT_TCP_PORT = portas dos túneis de mídia e"
    echo "LIVEKIT_NODE_IP = saída de scripts/playit-ip.sh <túnel-udp>. Use --set NOME=valor."
  fi
}

# Troca a linha NOME=... (a primeira; repetidas somem) ou acrescenta no fim,
# mantendo dono e permissão do arquivo.
set_var() {
  local pair="$1" file="$2" name value tmp
  [[ "$pair" == *=* ]] || die "use --set NOME=valor"
  name="${pair%%=*}" value="$(quote "${pair#*=}")"
  [[ "$name" =~ ^[A-Z][A-Z0-9_]*$ ]] || die "nome inválido: $name"
  [[ -f "$file" ]] || die "$file não existe (gere antes com --vps ou --pc)"
  tmp="$(mktemp "$file.XXXXXX")"
  NAME="$name" VALUE="$value" awk '
    BEGIN { name = ENVIRON["NAME"]; value = ENVIRON["VALUE"] }
    $0 ~ "^(export[ \t]+)?" name "=" { if (!done) print name "=" value; done = 1; next }
    { print }
    END { if (!done) print name "=" value }
  ' "$file" >"$tmp"
  chmod --reference="$file" "$tmp" 2>/dev/null || chmod 600 "$tmp" # macOS: sem --reference
  chown --reference="$file" "$tmp" 2>/dev/null || true
  mv "$tmp" "$file"
  echo "$name gravado em $file."
}

case "${1:-}" in
  --vps | --pc) [[ $# -eq 3 ]] || die "uso: $0 --vps|--pc http(s)://endereço arquivo"; generate "${1#--}" "$2" "$3" ;;
  --set) [[ $# -eq 3 ]] || die "uso: $0 --set NOME=valor arquivo"; set_var "$2" "$3" ;;
  *) die "uso: $0 --vps|--pc http(s)://endereço arquivo  |  $0 --set NOME=valor arquivo" ;;
esac

#!/usr/bin/env bash
# Atualiza um SERVIDOR PRÓPRIO da Salinha montado com o clone do repositório
# na própria VPS (docs/ai/servidor-proprio.md): baixa o código novo, gera o
# app web com o endereço do servidor e publica com o scripts/deploy-vps.sh
# para a própria máquina (root@localhost). Rode na VPS, como root:
#
#   /opt/concord-src/scripts/self-update.sh
#
# O deploy não derruba quem está em chamada (docs/HOSPEDAGEM.md, "Reinício do
# backend sem queda"). Variáveis (para testes): CONCORD_ENV (padrão
# /opt/concord/.env) e DEPLOY_SCRIPT (padrão scripts/deploy-vps.sh).
set -euo pipefail

# Tudo numa função chamada na última linha: o git pull pode trocar este
# arquivo no meio, e o bash já leu a função inteira antes de rodar.
main() {
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  ENV_FILE="${CONCORD_ENV:-/opt/concord/.env}"
  DEPLOY="${DEPLOY_SCRIPT:-$ROOT/scripts/deploy-vps.sh}"
  export PATH="/usr/local/go/bin:$PATH"

  url=$(sed -n -E 's/^(export[[:space:]]+)?PUBLIC_URL=//p' "$ENV_FILE" | tail -n 1 | tr -d "\"' \r")
  url="${url%/}"
  [[ -n "$url" ]] || { echo "ERRO: PUBLIC_URL vazio em $ENV_FILE" >&2; exit 1; }

  cd "$ROOT"
  git pull --ff-only
  (
    cd frontend
    export WEB_PUBLIC_URL="$url"
    yarn install --frozen-lockfile --ignore-scripts
    yarn build:web
  )
  "$DEPLOY" root@localhost
  echo "Salinha atualizada em $url"
}

main "$@"

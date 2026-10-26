#!/usr/bin/env bash
# Compila o salinha-host que vai dentro do app genérico (resources/host): é ele
# que instala o servidor numa VPS pelo SSH no "Hospedar um servidor".
#
#   scripts/build-host-deployer.sh windows|linux
#
# CONCORD_UPDATE_PUBKEY: chave pública (PEM) que confere o pacote do servidor
# (a mesma das atualizações do app genérico). Vazia = o deploy recusa.
# Roda num contêiner golang (o build do app roda no do electron-builder).
set -euo pipefail

TARGET="${1:-}"
case "$TARGET" in
  windows) GOOS=windows OUT=salinha-host.exe ;;
  linux) GOOS=linux OUT=salinha-host ;;
  *) echo "uso: $0 windows|linux" >&2; exit 1 ;;
esac
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/frontend/package.json').version" 2>/dev/null || grep -m1 '"version"' "$ROOT/frontend/package.json" | sed -E 's/.*"([0-9.]+)".*/\1/')"
PUBKEY_B64="$(printf '%s' "${CONCORD_UPDATE_PUBKEY:-}" | base64 -w0)"
if [[ -z "$PUBKEY_B64" ]]; then
  echo "aviso: CONCORD_UPDATE_PUBKEY vazio: o \"Hospedar um servidor\" deste build vai recusar instalar" >&2
fi

mkdir -p "$ROOT/frontend/resources/host"
docker run --rm \
  -v "$ROOT/backend:/src:ro" \
  -v "$ROOT/frontend/resources/host:/out" \
  -v concord-go-mod:/go/pkg/mod \
  -e GOOS="$GOOS" -e GOARCH=amd64 -e CGO_ENABLED=0 \
  -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
  -w /src golang:1.26-bookworm \
  bash -euo pipefail -c "
    go build -trimpath -ldflags '-s -w -X main.version=$VERSION -X main.updatePubKey=$PUBKEY_B64' -o /out/$OUT ./cmd/salinha-host
    chown \"\$HOST_UID:\$HOST_GID\" /out/$OUT
  "
echo "salinha-host ($TARGET) em frontend/resources/host/$OUT"

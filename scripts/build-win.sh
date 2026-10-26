#!/usr/bin/env bash
# Gera a Salinha para Windows com o endereço do servidor embutido.
#
#   scripts/build-win.sh http://SEU-ENDERECO.ply.gg:PORTA
#
# Saída em frontend/dist/: Salinha-<versão>-portable.exe (é só abrir) e
# Salinha-<versão>-setup.exe (instalador). Roda dentro do Docker
# (electronuserland/builder:wine) para não precisar de wine na máquina.
set -euo pipefail

#   scripts/build-win.sh --generic
#
# --generic: o instalador do GitHub Releases, sem servidor embutido (a tela
# inicial pergunta; scripts/release-oss.sh). Leva junto o salinha-host do
# "Hospedar um servidor" (scripts/build-host-deployer.sh).
SERVER_URL="${1:-}"
if [[ -z "$SERVER_URL" ]]; then
  echo "uso: $0 http://endereco-publico:porta | --generic" >&2
  exit 1
fi
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "$SERVER_URL" == "--generic" ]]; then
  SERVER_URL=""
  # O app troca pelo <servidor escolhido>/updates/ ao abrir (serverSwitch.ts);
  # este só preenche o app-update.yml do electron-builder.
  UPDATE_URL="http://127.0.0.1/updates/"
  "$ROOT/scripts/build-host-deployer.sh" windows
elif [[ ! "$SERVER_URL" =~ ^https?:// ]]; then
  echo "o endereço precisa começar com http:// ou https:// (recebido: $SERVER_URL)" >&2
  exit 1
else
  UPDATE_URL="${SERVER_URL%/}/updates/"
fi
mkdir -p "$ROOT/frontend/dist"

# Alvos (portable + instalador por padrão; release-win.sh usa só nsis) e a
# chave pública que valida atualizações (vazia = app sem auto-update).
BUILD_TARGETS="${BUILD_TARGETS:-portable nsis}"

# Helper nativo do som da janela (Rust → concord-audio.exe), embutido no app.
docker build -q -t concord-rust-win "$ROOT/native/concord-audio" >/dev/null
docker run --rm \
  -v "$ROOT/native/concord-audio:/src" \
  -v concord-cargo-cache:/usr/local/cargo/registry \
  -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
  -w /src concord-rust-win \
  bash -euo pipefail -c '
    cargo build --release --target x86_64-pc-windows-gnu
    chown -R "$HOST_UID:$HOST_GID" target
  '
mkdir -p "$ROOT/frontend/resources/win"
cp "$ROOT/native/concord-audio/target/x86_64-pc-windows-gnu/release/concord-audio.exe" "$ROOT/frontend/resources/win/"

# O projeto é copiado para dentro do container (sem node_modules do host) e só
# o resultado volta para frontend/dist — nada criado como root no repositório.
docker run --rm \
  -v "$ROOT/frontend:/src:ro" \
  -v "$ROOT/frontend/dist:/out" \
  -v concord-builder-cache:/root/.cache \
  -e VITE_SERVER_URL="$SERVER_URL" \
  -e CONCORD_UPDATE_URL="$UPDATE_URL" \
  -e CONCORD_UPDATE_PUBKEY="${CONCORD_UPDATE_PUBKEY:-}" \
  -e BUILD_TARGETS="$BUILD_TARGETS" \
  -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
  electronuserland/builder:wine \
  bash -euo pipefail -c '
    mkdir -p /work && cd /src
    tar --exclude=./node_modules --exclude=./out --exclude=./dist -cf - . | tar -xf - -C /work
    cd /work
    yarn install --frozen-lockfile --ignore-scripts
    yarn electron-vite build
    yarn electron-builder --win $BUILD_TARGETS --x64 --publish never
    cp dist/*.exe /out/
    cp dist/*.blockmap dist/latest.yml /out/ 2>/dev/null || true
    chown "$HOST_UID:$HOST_GID" /out/*
  '

echo
echo "Pronto. Servidor embutido: ${SERVER_URL:-nenhum (build genérico)}"
ls -lh "$ROOT"/frontend/dist/*.exe

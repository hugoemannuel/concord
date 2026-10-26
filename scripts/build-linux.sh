#!/usr/bin/env bash
# Gera, sem dependências/node_modules do host:
#   - AppImage x64 + latest-linux.yml (electron-updater);
#   - Salinha-<versão>-x64.tar.gz: o mesmo app + salinha-launcher, para a
#     instalação por usuário sem FUSE (site/install.sh e o updater próprio do
#     Linux em src/main/linuxUpdater.ts). O manifesto dele é do release-linux.sh.
# Uso: scripts/build-linux.sh https://endereco-publico | --generic
#
# --generic: o build do GitHub Releases, sem servidor embutido (a tela inicial
# pergunta), com o salinha-host do "Hospedar um servidor" junto.
set -euo pipefail

SERVER_URL="${1:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "$SERVER_URL" == "--generic" ]]; then
  SERVER_URL=""
  # O app troca pelo <servidor escolhido>/updates/ ao abrir (serverSwitch.ts).
  UPDATE_URL="http://127.0.0.1/updates/"
  "$ROOT/scripts/build-host-deployer.sh" linux
elif [[ ! "$SERVER_URL" =~ ^https?:// ]]; then
  echo "uso: $0 http(s)://endereco-publico | --generic" >&2
  exit 1
else
  UPDATE_URL="${SERVER_URL%/}/updates/"
fi
mkdir -p "$ROOT/frontend/dist"

docker run --rm --platform linux/amd64 \
  -v "$ROOT/frontend:/src:ro" \
  -v "$ROOT/frontend/dist:/out" \
  -v concord-builder-linux-cache:/root/.cache \
  -e VITE_SERVER_URL="$SERVER_URL" \
  -e CONCORD_UPDATE_URL="$UPDATE_URL" \
  -e CONCORD_UPDATE_PUBKEY="${CONCORD_UPDATE_PUBKEY:-}" \
  -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
  electronuserland/builder:22 \
  bash -euo pipefail -c '
    mkdir -p /work && cd /src
    tar --exclude=./node_modules --exclude=./out --exclude=./dist -cf - . | tar -xf - -C /work
    cd /work
    yarn install --frozen-lockfile --ignore-scripts
    yarn build
    yarn electron-builder --linux AppImage --x64 --publish never
    VERSION="$(node -p "require(\"./package.json\").version")"
    APP=dist/linux-unpacked
    test -x "$APP/salinha"
    install -m 755 build/linux/salinha-launcher "$APP/salinha-launcher"
    install -m 644 build/icon.png "$APP/salinha.png"
    printf "%s\n" "$VERSION" > "$APP/salinha-version"
    tar --sort=name --owner=0 --group=0 --numeric-owner -C "$APP" \
      -czf "dist/Salinha-$VERSION-x64.tar.gz" .
    cp dist/*.AppImage "dist/Salinha-$VERSION-x64.tar.gz" dist/latest-linux.yml /out/
    chown "$HOST_UID:$HOST_GID" /out/*.AppImage /out/*.tar.gz /out/latest-linux.yml
  '

echo "AppImage e .tar.gz gerados em frontend/dist (servidor: ${SERVER_URL:-nenhum, build genérico})"

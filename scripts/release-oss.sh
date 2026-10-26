#!/usr/bin/env bash
# Gera o release do GitHub (projeto open source): o app genérico, que pergunta
# o servidor na tela inicial, e o pacote do servidor para VPS, tudo assinado
# com a chave do projeto (separada da chave da VPS oficial).
#
#   scripts/release-oss.sh <versão>
#
# Saída em dist/release/ (tudo vai no GitHub Release v<versão>):
#   Salinha-<v>-setup.exe (+ .blockmap, .sig) e latest.yml       Windows
#   Salinha-<v>-x64.AppImage / .tar.gz (+ .sig) e latest-linux*.yml  Linux
#   salinha-server-<v>-linux-x64.tar.gz (+ .sig) e server-latest.yml  VPS
#   SHA256SUMS
#
# O pacote do servidor leva o app da mesma versão em updates/: cada servidor
# distribui as atualizações do app para quem está nele, e o próprio servidor
# se atualiza pelo server-latest.yml do release mais novo.
#
# KEY: chave Ed25519 (padrão backend/.release-key-oss; no CI, o secret
# RELEASE_KEY_OSS). O build oficial (deploy.yml) não usa esta chave.
set -euo pipefail

VERSION="${1:-}"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "uso: $0 <versão x.y.z>" >&2
  exit 1
fi
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEY="${KEY:-$ROOT/backend/.release-key-oss}"
OUT="$ROOT/dist/release"

if [[ ! -f "$KEY" ]]; then
  # No CI a chave vem do secret: gerar outra quebraria as atualizações.
  if [[ -n "${CI:-}" ]]; then
    echo "chave de assinatura ausente em $KEY (secret RELEASE_KEY_OSS)" >&2
    exit 1
  fi
  echo "Gerando a chave do projeto em $KEY (guarde um backup!)"
  openssl genpkey -algorithm ed25519 -out "$KEY"
  chmod 600 "$KEY"
fi
PUBKEY="$(openssl pkey -in "$KEY" -pubout)"
sign() { openssl pkeyutl -sign -inkey "$KEY" -rawin -in "$1" | base64 -w0 > "$1.sig"; }

cd "$ROOT/frontend"
node -e '
  const fs = require("fs")
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"))
  pkg.version = process.argv[1]
  fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n")
' "$VERSION"
rm -f dist/latest.yml dist/latest-linux.yml dist/latest-linux-tar.yml dist/*.blockmap \
  "dist/Salinha-$VERSION-setup.exe" "dist/Salinha-$VERSION-x64.AppImage" "dist/Salinha-$VERSION-x64.tar.gz"

echo "== App genérico $VERSION (Windows)"
CONCORD_UPDATE_PUBKEY="$PUBKEY" BUILD_TARGETS="nsis" "$ROOT/scripts/build-win.sh" --generic
echo "== App genérico $VERSION (Linux)"
CONCORD_UPDATE_PUBKEY="$PUBKEY" "$ROOT/scripts/build-linux.sh" --generic

SETUP="dist/Salinha-$VERSION-setup.exe"
IMAGE="dist/Salinha-$VERSION-x64.AppImage"
TARBALL="dist/Salinha-$VERSION-x64.tar.gz"
for f in "$SETUP" "$IMAGE" "$TARBALL" dist/latest.yml dist/latest-linux.yml; do
  test -f "$f" || { echo "build não gerou $f" >&2; exit 1; }
done
for f in "$SETUP" "$IMAGE" "$TARBALL"; do sign "$f"; done
# Manifesto do .tar.gz: o mesmo formato do scripts/release-linux.sh.
{
  echo "version: $VERSION"
  echo "path: $(basename "$TARBALL")"
  echo "sha512: $(sha512sum "$TARBALL" | cut -d' ' -f1)"
  echo "size: $(stat -c %s "$TARBALL")"
  echo "releaseDate: '$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'"
} > dist/latest-linux-tar.yml

rm -rf "$OUT"
CLIENT="$OUT/client"
mkdir -p "$CLIENT"
cp "$SETUP" "$SETUP.sig" "$SETUP.blockmap" dist/latest.yml \
  "$IMAGE" "$IMAGE.sig" dist/latest-linux.yml \
  "$TARBALL" "$TARBALL.sig" dist/latest-linux-tar.yml "$CLIENT/"

echo "== Servidor $VERSION (VPS Linux x64)"
KEY="$KEY" CLIENT_DIR="$CLIENT" "$ROOT/scripts/package-server.sh" "$VERSION" "$OUT"

# O app também vai solto no release (download direto da página do GitHub).
mv "$CLIENT"/* "$OUT/"
rmdir "$CLIENT"
(cd "$OUT" && sha256sum -- * > SHA256SUMS)

echo
echo "Release $VERSION pronto em dist/release/:"
ls -lh "$OUT"
echo "Lembre de commitar a nova versão em frontend/package.json."

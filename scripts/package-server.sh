#!/usr/bin/env bash
# Monta e assina o pacote do servidor para VPS Linux x64 (o que o "Hospedar um
# servidor" do app instala pelo SSH e o que o servidor baixa para se atualizar).
#
#   scripts/package-server.sh <versão> [pasta de saída]
#
# Saída (padrão dist/server/):
#   salinha-server-<versão>-linux-x64.tar.gz      bin/, migrations/, updates/
#   salinha-server-<versão>-linux-x64.tar.gz.sig  Ed25519 (base64), como os .sig do app
#   server-latest.yml                             versão, arquivo e sha512
#
# Ambiente:
#   KEY         chave Ed25519 privada que assina (padrão backend/.release-key-oss).
#               A pública vai embutida no salinha-host: é ela que confere as
#               atualizações e o deploy.
#   CLIENT_DIR  pasta com o app da mesma versão (latest*.yml, instaladores e
#               .sig): vai em updates/, de onde os amigos se atualizam.
#   RELEASES_URL  (opcional) troca o endereço dos releases embutido (testes).
#
# Precisa de: go, curl, tar, xz, unzip, openssl. Roda no CI (ubuntu) ou num
# contêiner golang.
set -euo pipefail

VERSION="${1:-}"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "uso: $0 <versão x.y.z> [pasta de saída]" >&2
  exit 1
fi
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$(mkdir -p "${2:-$ROOT/dist/server}" && cd "${2:-$ROOT/dist/server}" && pwd)"
KEY="${KEY:-$ROOT/backend/.release-key-oss}"
CACHE="${CACHE:-$ROOT/dist/server-cache}"

# Versões fixas: trocar é uma decisão (o LiveKit acompanha o docker-compose.yml).
LIVEKIT_VERSION=1.13.10
POSTGRES_VERSION=17.11.0
CADDY_VERSION=2.11.7

if [[ ! -f "$KEY" ]]; then
  echo "chave de assinatura não encontrada: $KEY" >&2
  exit 1
fi
PUBKEY_B64="$(openssl pkey -in "$KEY" -pubout | base64 -w0)"

mkdir -p "$CACHE"
fetch() { # url destino (fica em cache entre execuções)
  [[ -s "$2" ]] && return 0
  curl -fsSL --retry 3 -o "$2.tmp" "$1"
  mv "$2.tmp" "$2"
}

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/bin/postgres" "$STAGE/updates"

echo "LiveKit $LIVEKIT_VERSION"
fetch "https://github.com/livekit/livekit/releases/download/v$LIVEKIT_VERSION/livekit_${LIVEKIT_VERSION}_linux_amd64.tar.gz" "$CACHE/livekit-$LIVEKIT_VERSION.tar.gz"
tar -xzf "$CACHE/livekit-$LIVEKIT_VERSION.tar.gz" -C "$STAGE/bin" livekit-server

echo "Postgres $POSTGRES_VERSION (portátil)"
fetch "https://repo1.maven.org/maven2/io/zonky/test/postgres/embedded-postgres-binaries-linux-amd64/$POSTGRES_VERSION/embedded-postgres-binaries-linux-amd64-$POSTGRES_VERSION.jar" "$CACHE/postgres-$POSTGRES_VERSION.jar"
unzip -p "$CACHE/postgres-$POSTGRES_VERSION.jar" 'postgres-linux-x86_64.txz' | tar -xJf - -C "$STAGE/bin/postgres"

echo "Caddy $CADDY_VERSION"
fetch "https://github.com/caddyserver/caddy/releases/download/v$CADDY_VERSION/caddy_${CADDY_VERSION}_linux_amd64.tar.gz" "$CACHE/caddy-$CADDY_VERSION.tar.gz"
tar -xzf "$CACHE/caddy-$CADDY_VERSION.tar.gz" -C "$STAGE/bin" caddy

echo "salinha-host e backend $VERSION"
LDFLAGS="-s -w -X main.version=$VERSION -X main.updatePubKey=$PUBKEY_B64"
if [[ -n "${RELEASES_URL:-}" ]]; then LDFLAGS="$LDFLAGS -X main.releasesURL=$RELEASES_URL"; fi
(
  cd "$ROOT/backend"
  CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags "$LDFLAGS" -o "$STAGE/bin/salinha-host" ./cmd/salinha-host
  CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags "-s -w" -o "$STAGE/bin/concord-server" ./cmd
)
cp -r "$ROOT/backend/migrations" "$STAGE/migrations"
if [[ -n "${CLIENT_DIR:-}" ]]; then
  cp "$CLIENT_DIR"/* "$STAGE/updates/"
fi

# Licenças do que vai junto (Apache-2.0 do LiveKit e do Caddy, PostgreSQL License).
mkdir -p "$STAGE/licenses"
tar -xzf "$CACHE/livekit-$LIVEKIT_VERSION.tar.gz" -O LICENSE > "$STAGE/licenses/livekit-LICENSE" 2>/dev/null || true
tar -xzf "$CACHE/caddy-$CADDY_VERSION.tar.gz" -O LICENSE > "$STAGE/licenses/caddy-LICENSE" 2>/dev/null || true
echo "$VERSION" > "$STAGE/VERSION"
chmod 755 "$STAGE/bin/"* "$STAGE/bin/postgres/bin/"*

FILE="salinha-server-$VERSION-linux-x64.tar.gz"
tar -czf "$OUT/$FILE" --owner=0 --group=0 -C "$STAGE" .
openssl pkeyutl -sign -inkey "$KEY" -rawin -in "$OUT/$FILE" | base64 -w0 > "$OUT/$FILE.sig"
SHA512="$(openssl dgst -sha512 -binary "$OUT/$FILE" | base64 -w0)"
cat > "$OUT/server-latest.yml" <<EOF
version: $VERSION
linux: $FILE
linux_sha512: $SHA512
EOF

echo
echo "Pronto: $OUT/$FILE ($(du -h "$OUT/$FILE" | cut -f1))"

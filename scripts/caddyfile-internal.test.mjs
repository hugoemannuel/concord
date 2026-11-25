// /internal/* do backend (o aviso de falha do systemd, docs/adr/0071) é só da
// própria VPS: nenhum bloco do Caddy pode repassar esse caminho. O backend
// ainda recusa pedido com X-Forwarded-For (internal/alert/unit_handler.go).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (name) => readFileSync(new URL(`../deploy/${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
// Linhas ativas (sem comentários).
const active = (text) => text.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n')

for (const name of ['Caddyfile', 'Caddyfile.modelo']) {
  test(`deploy/${name}: todo repasse ao backend deixa /internal/* de fora`, () => {
    const text = active(read(name))
    // Cada "import salinha_backend" está num "handle @backend" com caminhos
    // listados ou no salinha_app, que responde 404 em /internal/* antes.
    const uses = [...text.matchAll(/^(\t*)import salinha_backend$/gm)]
    assert.ok(uses.length > 0, 'nenhum repasse ao backend')
    for (const matcher of text.matchAll(/@backend path ([^\n]+)/g)) {
      assert.doesNotMatch(matcher[1], /\/internal|(^|\s)\/\*|(^|\s)\*/, `@backend repassa /internal: ${matcher[1]}`)
    }
    const app = text.match(/^\(salinha_app\) \{\n[\s\S]*?\n\}/m)
    if (!app) return
    const block = app[0]
    const deny = block.search(/handle \/internal\/\* \{\n\s*respond 404\n\s*\}/)
    assert.ok(deny >= 0, 'salinha_app sem o 404 de /internal/*')
    assert.ok(deny < block.indexOf('import salinha_backend'), 'o 404 de /internal/* tem que vir antes do backend')
  })
}

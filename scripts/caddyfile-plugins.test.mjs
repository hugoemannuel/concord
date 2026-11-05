// Os plugins rodam em iframe isolado (origem opaca): os módulos .js só
// carregam se /plugins/* sair com Access-Control-Allow-Origin.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const linha = /^\s*(#\s*)?header\s+\/plugins\/\*\s+Access-Control-Allow-Origin\s+\*\s*$/m;

test('deploy/Caddyfile manda CORS em /plugins/* dentro do bloco do site', () => {
  const texto = readFileSync(new URL('../deploy/Caddyfile', import.meta.url), 'utf8');
  // do "salinha.bhrx.com.br {" até o primeiro "}" na coluna 0 (tolera CRLF)
  const bloco = texto.replace(/\r\n/g, '\n').match(/^salinha\.bhrx\.com\.br \{\n[\s\S]*?\n\}/m);
  assert.ok(bloco, 'faltou o bloco salinha.bhrx.com.br { ... }');
  assert.match(bloco[0], /^\s*header\s+\/plugins\/\*\s+Access-Control-Allow-Origin\s+\*\s*$/m);
});

test('deploy/Caddyfile.modelo traz o mesmo cabeçalho (comentado)', () => {
  const texto = readFileSync(new URL('../deploy/Caddyfile.modelo', import.meta.url), 'utf8');
  assert.match(texto, linha);
});

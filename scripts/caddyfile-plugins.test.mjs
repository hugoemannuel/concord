// Os plugins rodam em iframe isolado (origem opaca): os módulos .js só
// carregam se /plugins/* sair com Access-Control-Allow-Origin.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const linha = /^\s*(#\s*)?header\s+\/plugins\/\*\s+Access-Control-Allow-Origin\s+\*\s*$/m;

test('deploy/Caddyfile manda CORS em /plugins/* no site', () => {
  const texto = readFileSync(new URL('../deploy/Caddyfile', import.meta.url), 'utf8');
  const m = texto.match(/^\s*header\s+\/plugins\/\*\s+Access-Control-Allow-Origin\s+\*\s*$/m);
  assert.ok(m, 'faltou "header /plugins/* Access-Control-Allow-Origin *"');
  assert.ok(texto.indexOf(m[0]) > texto.indexOf('salinha.bhrx.com.br {'));
});

test('deploy/Caddyfile.modelo traz o mesmo cabeçalho (comentado)', () => {
  const texto = readFileSync(new URL('../deploy/Caddyfile.modelo', import.meta.url), 'utf8');
  assert.match(texto, linha);
});

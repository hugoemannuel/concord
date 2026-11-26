# Atualização obrigatória e modal de novidades

Data: 2026-11-24 · ADR: [0066](../../adr/0066-atualizacao-obrigatoria-e-novidades.md)

## Por quê

1. Algumas versões quebram a compatibilidade (protocolo, API): quem fica na versão antiga
   precisa ser **obrigado** a atualizar para continuar usando.
2. A equipe quer **mostrar as novidades** que achar relevantes a quem acabou de atualizar,
   sem obrigar ninguém a abrir a página de Novidades.

## Decisões do dono (2026-11-24)

- A marcação é **no PR, pela nota** em `changelog/pending/`: um cabeçalho no topo do arquivo.
- O modal de novidades mostra **só as notas marcadas como destaque**, **uma vez**, na primeira
  abertura depois de atualizar, com "Ver todas" para a página de Novidades que já existe.
- Vale para **desktop e web**. Android fica para depois (não se atualiza sozinho e tem versão
  própria).

## Como funciona

### Marcação (PR)

```md
---
obrigatoria: true
destaque: true
---
## Novidades

- Chat: texto da novidade.
```

- `obrigatoria: true`: a versão que levar este arquivo passa a ser a **versão mínima**. Precisa
  ter ao menos uma nota (é o que explica por que atualizar).
- `destaque: true`: todas as notas do arquivo entram no modal de novidades.
- Chave desconhecida ou valor diferente de `true`/`false` é erro no `--check` (antes do merge).

### Deploy e backend

- `publish-changelog.mjs` manda `highlight` e `required` em cada nota.
- O servidor guarda `highlight` por nota e marca a release como `required` se alguma nota
  **nova** dela (as já publicadas são descartadas, ver `dedup.go`) veio de arquivo obrigatório.
- `GET /api/changelog` passa a trazer `highlight` (nota) e `required` (release).
- `GET /api/changelog/required` (sem login) devolve `{ "min_version": "x.y.z" }` (vazio se
  nenhuma): a versão mais alta entre as obrigatórias. Sem login porque a janelinha de abertura
  (processo main) não tem o token; a informação já é pública (`/updates/latest.yml`).
- Ao publicar, o servidor avisa todo mundo pelo WS (`changelog:update`): o aviso de versão nova
  (`app:update`) sai antes de o changelog ser publicado, então sem isso o app só saberia da
  obrigatoriedade na próxima abertura.

### Desktop

- **Janelinha de abertura**: se a versão instalada é menor que a mínima, o "Abrir sem atualizar"
  não aparece. A abertura continua nunca travando: sem rede, falha ou download parado, o app abre
  (e o modal abaixo bloqueia).
- **Modal obrigatório** (app aberto): sem X, sem Esc, sem clicar fora; só "Atualizar agora", que
  usa o fluxo de atualização que já existe (baixa, mostra o progresso e reinicia; em call de
  canal, volta para o canal).

### Web

- A web é sempre a versão do último deploy: não tem bloqueio.

### Novidades (desktop e web)

- Guarda no aparelho a última versão vista. Na primeira vez (sem nada guardado) só grava a
  atual, sem modal: quem acabou de criar a conta não recebe o histórico inteiro.
- Depois de atualizar: junta os destaques das versões entre a vista e a atual (pode ter pulado
  várias). Sem destaque, grava e não mostra nada.
- Fechar ou "Ver todas" grava a versão atual. Com o modal obrigatório aberto, o de novidades não
  aparece.

## Fora do escopo

- Android.
- Bloquear no servidor versões antigas que não têm este código (as que já estão instaladas hoje
  não sabem mostrar o modal). Ver ADR.
- Tela de admin para marcar obrigatória depois do deploy.

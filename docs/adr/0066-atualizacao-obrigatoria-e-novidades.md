# 0066. Atualização obrigatória e modal de novidades marcadas na nota do changelog

- Status: aceito
- Data: 2026-11-24
- Complementa: [0028](0028-atualizacoes-pelo-github-releases.md), [0044](0044-janelinha-de-abertura-que-atualiza.md)
- Spec: [2026-11-24-atualizacao-obrigatoria-e-novidades-design.md](../superpowers/specs/2026-11-24-atualizacao-obrigatoria-e-novidades-design.md)

## Contexto

O dono quer (1) obrigar todo mundo a atualizar em certas versões e (2) mostrar, uma vez, as
novidades que a equipe escolher. Hoje a atualização do desktop é opcional (aviso na barra e
"Abrir sem atualizar" na janelinha) e as notas de cada versão já chegam ao servidor pelo deploy
(`changelog/pending/` → `PUT /api/changelog/:versão`). O número da versão só é decidido no deploy
(`scripts/next-version.mjs`), então ninguém sabe no PR qual vai ser.

## Opções consideradas

1. **Versão mínima numa configuração remota** (o padrão do Firebase Remote Config: parâmetro
   `minimum_version` comparado com a versão instalada ao abrir; bloqueio sem fechar para a
   obrigatória). Aqui seria uma variável no servidor (`MIN_APP_VERSION`): exige alguém mexer no
   `.env` da VPS depois do deploy, fora do git, e não resolve as novidades.
2. **Marca na entrada do feed de atualização** (o Sparkle tem itens "críticos" e
   `minimumAutoupdateVersion` no appcast). O `latest.yml` do electron-builder não tem campo para
   isso e é gerado pelo build; cada plataforma tem o seu manifesto.
3. **Marca na nota do changelog, no PR (escolhida).** O arquivo de `changelog/pending/` ganha um
   cabeçalho (`obrigatoria`, `destaque`); o deploy já envia as notas com a versão certa, e o
   servidor deriva a versão mínima das releases obrigatórias. Fica versionado e revisado no PR,
   sem tela nova, e serve às duas coisas.
4. **Tela de admin.** Mais flexível (marcar depois do deploy), mas é tela, permissão e auditoria
   novas para um evento raro.

## Decisão

Opção 3, com:

- Cabeçalho `---`/`chave: true`/`---` no topo da nota; chave desconhecida é erro no `--check`.
  Nota obrigatória sem nenhum bullet é erro (alguém precisa explicar por quê).
- Migration `000209`: `changelog_releases.required` e `changelog_entries.highlight`. A release é
  obrigatória se alguma nota **nova** dela (depois da deduplicação por arquivo) era obrigatória:
  reenviar o mesmo arquivo nos deploys seguintes não torna as próximas versões obrigatórias.
- `GET /api/changelog/required` público com a maior versão obrigatória, para a janelinha (main,
  sem token) e o app. Ao publicar, o servidor manda `changelog:update` pelo WS.
- Desktop: a janelinha esconde o "Abrir sem atualizar" e o app aberto mostra um modal sem fechar,
  só com "Atualizar agora" (o fluxo de instalação que já existe). A abertura continua sem travar
  (ADR 0044): falha ou demora abre o app, e o modal bloqueia.
- Web: sem bloqueio (é sempre a versão do último deploy).
- Novidades: última versão vista no `localStorage`; sem nada guardado, só grava.

## Consequências

- Só bloqueia quem já tem esta versão: as instaladas antes deste PR não conhecem o modal.
  Bloquear essas exigiria recusar a conexão no servidor pela versão do User-Agent, que o app
  antigo mostraria como erro de conexão; fica para quando for preciso.
- Marcar obrigatória depois do deploy exige outro deploy com uma nota obrigatória.
- `destaque` vale para o arquivo inteiro (todas as notas dele).

## Fontes

- [Firebase: Enforce a minimum app version with Remote Config](https://firebase.google.com/docs/remote-config/use-cases/minimum-version)
- [Sparkle: Publishing an update (critical updates, minimumAutoupdateVersion)](https://sparkle-project.org/documentation/publishing/)
- [Forced Update of Mobile Apps (Adapptor)](https://medium.com/adapptor/forced-update-of-mobile-apps-6efe57730e97)

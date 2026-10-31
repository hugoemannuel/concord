# AGENTS.md

Instruções para agentes de IA (Claude Code, Gemini CLI, Codex...) neste repo. É a
**fonte única**: o `CLAUDE.md` só importa este arquivo. Detalhes ficam nos links,
que você deve ler quando o assunto aparecer.

Salinha (repo `concord`): chat estilo Discord. Backend Go (Gin + Postgres +
WebSocket), cliente Electron/React (também publicado como app web), app Android
em Expo/React Native (`mobile/`), LiveKit para voz/vídeo/tela e um helper Rust
para áudio de janela no Windows.

## Regras inegociáveis

1. **CRAP ≤ 15 em toda função que você tocar.** Meça antes
   (`node scripts/crap.mjs --files <arquivos>`) e depois (`node scripts/crap.mjs`).
   Passou de 15: quebre a função e/ou teste até ficar ≤ 15. Acima de 15 de
   complexidade, nem 100% de cobertura salva. → [docs/ai/exemplos/crap.md](docs/ai/exemplos/crap.md)
2. **Sem god files e god services.** Tocou num arquivo com mais de uma
   responsabilidade (> 400 linhas, > 7 dependências, nome genérico, "faz X e Y"):
   **no mesmo PR**, extraia a responsabilidade que você alterou. Arquivo tocado
   acima de 400 linhas sai do PR menor do que entrou. Nunca adicione campos a
   god stores (`callStore`, `chatStore`, `serverStore`) nem métodos a
   `call/service.go`. → [docs/ai/exemplos/god-files.md](docs/ai/exemplos/god-files.md)
3. **Estrutura de pastas por feature/domínio.** Nenhum arquivo solto; cada coisa
   na pasta da sua feature. → [docs/ai/arquitetura.md](docs/ai/arquitetura.md)
4. **Arquitetura decidida, não improvisada.** Para feature nova, pesquise na
   internet 2–3 padrões que servem, compare com o que o repo já faz, escolha o
   mais simples e registre um ADR em `docs/adr/` se fugir do padrão.
   → [docs/ai/arquitetura.md § Escolhendo a arquitetura](docs/ai/arquitetura.md#escolhendo-a-arquitetura-de-uma-feature)
5. **TDD e testes só do que importa.** Teste primeiro, falhando pelo motivo
   certo. Bug corrigido sempre vem com teste de regressão. Rode só o afetado
   (`affected-tests loop`); a suíte completa só quando o diff toca código
   compartilhado. → [docs/ai/exemplos/testes.md](docs/ai/exemplos/testes.md)
6. **Responsivo sempre.** Toda UI nova ou alterada funciona de 360 px a telas
   largas, com toque e teclado. → [docs/ai/exemplos/responsivo.md](docs/ai/exemplos/responsivo.md)
7. **Sem dependência nova** (go.mod, package.json) sem ADR.
8. **Evidência antes de "pronto".** Só diga que terminou com a saída de
   `node scripts/affected-tests.mjs pr` verde na mão.
9. **Segredos**: nunca imprima, logue ou commite o conteúdo de `.env` ou de chaves.
10. **Design: ícones, tokens e componentes de `shared/ui`.** Ícone é SVG de
    `shared/ui/icons` (nunca emoji/✕/✓ de texto); botão é `Button`,
    `IconButton` ou `CloseButton`; cor, texto e raio só pelos tokens; foco
    visível (`focus-ring`). A catraca `scripts/check-design.mjs` barra o diff que
    piora. → [docs/ai/exemplos/design.md](docs/ai/exemplos/design.md)

## Fluxo de trabalho (da ideia ao PR)

| Comando | Use para | Procedimento |
|---|---|---|
| `/ideia <texto>` | ideia vaga → spec aprovada | [docs/ai/pipeline-ideia.md](docs/ai/pipeline-ideia.md) |
| `/feature <spec ou descrição>` | implementar até o PR | [docs/ai/pipeline-feature.md](docs/ai/pipeline-feature.md) |
| `/bugfix <sintoma>` | corrigir com causa raiz e teste | [docs/ai/pipeline-bugfix.md](docs/ai/pipeline-bugfix.md) |

Os comandos usam as skills do plugin **superpowers** (já vinculado em
`.claude/settings.json`). Catálogo das skills, de onde vieram e como instalar
em cada agente: [docs/ai/skills.md](docs/ai/skills.md). Sem um comando, para
mudanças pequenas (o diff cabe numa frase), faça direto, mas as regras acima
valem igual.

## Comandos

```bash
# Pipeline de verificação (raiz do repo)
node scripts/affected-tests.mjs loop    # a cada ciclo TDD: só os testes afetados
node scripts/affected-tests.mjs pr      # antes do PR: afetados + vet/typecheck + estrutura + design + CRAP
node scripts/affected-tests.mjs full    # suíte inteira
node scripts/crap.mjs [--files a b | --base <ref>]
node scripts/check-structure.mjs        # pastas + catraca anti-god
node scripts/check-design.mjs           # catraca de design (--all: inventário do renderer)

# Backend (backend/, Go 1.26, módulo gin-quickstart/backend)
go build ./... && go vet ./...
go test ./internal/call -run TestNome   # um teste
scripts/server-up.sh                    # Postgres + LiveKit (docker compose) e o backend

# Frontend (frontend/, Yarn 1)
yarn dev            # Electron;   yarn dev:web  → app no navegador
yarn typecheck && yarn test
npx vitest run src/renderer/src/features/chat/lib/mentions.test.ts

# Mobile (mobile/, Expo SDK 58, Yarn 1, Jest com jest-expo)
yarn start                              # Metro; abre no emulador/aparelho (Dev Client)
yarn typecheck && yarn test
EXPO_PUBLIC_SERVER_URL=https://servidor node scripts/mobile-build.mjs   # APK local (prebuild + Gradle)
```

A base dos scripts é `origin/develop` (ou `origin/main`, se não houver develop);
mude com `--base <ref>`. O CI (`.github/workflows/deploy.yml`) não roda testes,
só faz deploy a cada merge na `main`: **quem garante os testes é você, localmente.**

## Arquitetura em 30 segundos

- **Backend, monólito modular**: `internal/<domínio>/` (model → repository →
  service → handler → routes), infra em `internal/platform/` (database,
  websocket, livekit, media...), ligação em `cmd/wire_<área>.go`. Eventos em tempo
  real pelo `platform/websocket` Hub (salas `channel:`, `conversation:`,
  `server:`, `user:`, `call:`). Estado das chamadas em memória no `call`, espelhado
  no banco e recarregado no boot; a mídia vai direto para o LiveKit, nunca passa
  pelo Go. Migrations em `backend/migrations/` aplicadas no boot.
- **Frontend**: `src/main/` (Electron por responsabilidade), `src/preload/`
  (`window.api`), `src/renderer/src/{app,features,shared}`. Zustand (um store
  por responsabilidade), Tailwind v4 com tokens em `assets/main.css`. A URL do
  servidor é constante de build (`VITE_SERVER_URL`).
- **Mobile** (`mobile/`, [ADR 0021](docs/adr/0021-app-mobile-expo.md)): app Android
  independente do `frontend/`. Rotas finas em `app/` (Expo Router), código em
  `src/{features,shared}` com a mesma estrutura do desktop; lógica pura portada por
  cópia adaptada. Tokens no `expo-secure-store`; URL do servidor é constante de
  build (`EXPO_PUBLIC_SERVER_URL`).
- Docs de domínio: [docs/CARGOS.md](docs/CARGOS.md) (permissões),
  [docs/ATIVIDADE.md](docs/ATIVIDADE.md), [docs/HOSPEDAGEM.md](docs/HOSPEDAGEM.md).
  Specs e planos antigos: `docs/superpowers/` (registro histórico: confie no
  código).

## Convenções do repo

- Código, comentários, docs, UI e commits em **português**. Commits
  convencionais (`feat(área):`, `fix(área):`, `refactor:`, `docs:`).
- **Nunca** coloque `Co-Authored-By` de IA nem qualquer atribuição a IA em commits
  ou PRs.
- **Git flow** (branches a partir de `origin/develop`, PR para `develop`, `release:` e
  `hotfix:` para a `main`, commit estrutural separado, confirmação antes de push, PR,
  merge e deploy): [.claude/rules/git-flow.md](.claude/rules/git-flow.md). Leia antes de
  commitar, dar push ou abrir PR.
- Texto que o usuário final lê (UI, bot, e-mail) precisa de aprovação humana.
- Peça confirmação antes de qualquer coisa difícil de desfazer.

## Pegadinhas do ambiente (Windows)

- Checkout em CRLF: não rode `prettier --write` nem `gofmt -w` no repo inteiro (reescreve
  tudo); formate só o que mudou. No `yarn lint`, só os erros (`severity 2`) importam.
- Go pode não estar no PATH: os scripts aceitam `GO=/caminho/para/go.exe`.
- LiveKit em Docker Desktop no Windows não passa mídia (`network_mode: host`):
  para testar chamada local, use o `livekit-server.exe` nativo.
- Recusar o seletor de tela no main do Electron é `callback(null)`; `callback({})` lança.

Regras por área ficam em `.claude/rules/`: [git-flow](.claude/rules/git-flow.md) (vale
para tudo), [backend-go](.claude/rules/backend-go.md) e
[frontend-ts](.claude/rules/frontend-ts.md) (só para a parte do código).
Outros agentes: leia o arquivo da área antes de editar nela.

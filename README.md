# Salinha

> Chat em tempo real com canais de voz, vídeo, compartilhamento de tela e atividades, no desktop e no navegador.

Salinha é um aplicativo de comunicação estilo Discord, construído do zero como
projeto de estudo de arquitetura. Traz servidores com cargos e permissões,
canais de texto e voz, DMs e grupos, amizades, chamadas (voz, vídeo e
compartilhamento de tela via LiveKit), níveis e conquistas, em um cliente
desktop (Windows e Linux) e também em versão web, com tema escuro.

![Go](https://img.shields.io/badge/Go-1.26-00ADD8?logo=go&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-44-47848F?logo=electron&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)

## 🏠 Quer ter o seu próprio servidor da Salinha?

Não precisa saber nada de tecnologia. Abra uma IA (Claude, ChatGPT, Gemini...),
mande o link deste repositório e diga **"quero ter meu próprio servidor da
Salinha"**. Ela conduz tudo em português simples, passo a passo, e faz a parte
técnica por você. Custa a partir de uns R$ 40 por mês (o aluguel do servidor).

> **Se você é uma IA** e a pessoa quer o próprio servidor, siga
> [docs/ai/servidor-proprio.md](docs/ai/servidor-proprio.md).

## 📖 Sobre o projeto

A Salinha nasceu com a ideia de entender, na prática, como funciona uma
aplicação de chat em tempo real de ponta a ponta: autenticação, permissões,
mensageria via WebSocket, presença online e chamadas P2P com WebRTC.

O objetivo **não** é competir com o Discord, e sim servir como referência de
arquitetura — do banco de dados ao cliente desktop — mantendo o código simples,
modular e fácil de evoluir.

## ✨ Funcionalidades

**Conta**
- Cadastro e login (por e-mail ou nome de usuário) com JWT (access + refresh) e senha com bcrypt
- Confirmação de e-mail e recuperação de senha por SMTP
- Perfil com avatar, banner, status e aniversário; privacidade e bloqueio de usuários

**Social**
- Amigos: buscar, enviar/aceitar/recusar/cancelar solicitações, bloquear
- DMs e **conversas em grupo**, com contagem de não lidas e presença online ao vivo
- **Em atividade**: o jogo em andamento aparece embaixo do nome e na coluna "Atividade" (só Windows). Ver [docs/ATIVIDADE.md](docs/ATIVIDADE.md)

**Servidores**
- Criar, editar, ordenar e convidar (código/link de convite, com pré-visualização)
- **Cargos e permissões** no estilo Discord, com sobrescritas por canal. Ver [docs/CARGOS.md](docs/CARGOS.md)
- Apelidos por servidor, banimento e expulsão
- Canais de **texto** e de **voz**, com reordenação

**Chat**
- Mensagens em tempo real (canais, DMs e grupos) via WebSocket, com histórico paginado
- Edição e exclusão, reações, menções (`@all`/`@here`), enquetes, indicador de digitação
- Anexos (imagem, vídeo, áudio) com tipo detectado pelos bytes do arquivo e gravação de mensagem de voz

**Chamadas** (LiveKit)
- Voz em canal, 1:1 e em grupo; vídeo e várias câmeras
- **Compartilhamento de tela com vários participantes ao mesmo tempo**, com som (Windows)
- **Mesa de áudio** (soundboard) por servidor, com atalhos
- **Supressão de ruído** (RNNoise), escolha de microfone e saída, teste de microfone
- Mudo/ensurdecido visíveis para todos e moderação na chamada (silenciar, ensurdecer, mover)
- **Atividades**: jogos web abertos junto com a chamada (hoje, Krunker.io)

**Engajamento**
- **Níveis** por tempo em chamada (XP por minuto) e **conquistas** (badges com raridade)

**App desktop**
- Segundo plano na bandeja, instância única, iniciar com o sistema, notificações de chamada e DM
- **Overlay** da chamada sobre outras janelas, com atalho configurável
- Atualização automática com instaladores assinados

<!-- ## 🖼️ Screenshots  (preciso de imagens/GIFs) -->

## 🧱 Stack

### Backend
| Tecnologia | Uso |
|---|---|
| Go 1.26 | Linguagem do servidor |
| Gin | Framework HTTP e roteamento |
| pgx v5 | Driver PostgreSQL |
| coder/websocket | WebSocket (tempo real) |
| JWT + bcrypt | Auth (access/refresh + hash de senha) |
| SMTP | E-mails de confirmação e recuperação de senha |
| PostgreSQL 17 | Banco de dados |
| Docker Compose | Postgres + LiveKit locais |
| LiveKit (SFU) | Servidor de mídia das chamadas |
| golang-migrate | Migrations versionadas (aplicadas no boot) |

### Frontend
| Tecnologia | Uso |
|---|---|
| Electron 44 | App desktop |
| electron-vite 5 / Vite 7 | Build/dev do Electron e do app web |
| React 19 + TypeScript | Interface |
| Zustand | Estado global |
| Tailwind CSS v4 | Estilização (tokens via `@theme`) |
| react-router-dom 7 | Rotas (HashRouter) |
| livekit-client | Voz, vídeo e compartilhamento de tela (com som) via SFU |
| electron-updater | Atualização automática (instaladores assinados) |
| Vitest | Testes unitários |

### Nativo e infraestrutura
| Tecnologia | Uso |
|---|---|
| Rust (`native/concord-audio`) | Helper do som da janela compartilhada (Windows, WASAPI) |
| Caddy | Proxy/HTTPS na VPS (`deploy/Caddyfile`) |
| GitHub Actions | Deploy automático na VPS a cada merge na `main` |

## 🏗️ Arquitetura

**Monólito modular**: uma única aplicação Go, organizada por domínio. Cada
domínio expõe a mesma cadeia de responsabilidades, para que partes possam ser
extraídas depois caso a escala exija.

```text
Client (Electron/React)
  │
  ├── HTTP ────────┐
  │                ▼
  ├── WebSocket ─► Go (Gin) ──► PostgreSQL
  │                  │
  │                  └── /rtc (proxy) ─► LiveKit (sinalização)
  │
  └── mídia WebRTC (UDP/TCP) ─────────► LiveKit (SFU)
```

Cada módulo em `internal/` segue:

```text
handler      → comunicação externa (request/response)
service      → regras de negócio
repository   → persistência
model        → tipos e eventos
```

Regra de dependência: `Handler → Service → Repository → Database`.

### Estrutura do repositório

```text
concord/
├── backend/          # API em Go + WebSocket + token/proxy do LiveKit
│   ├── cmd/          # main.go
│   ├── internal/     # auth, user, friendship, server, role, permission, channel,
│   │                 # message, conversation, call, soundboard, badge, level,
│   │                 # websocket, livekit, media, mailer, updates, database, ...
│   └── migrations/   # SQL versionado
├── native/           # concord-audio: helper Rust do som da janela (Windows)
├── site/             # landing page com os downloads (Windows e Linux)
├── deploy/           # Caddyfile e units systemd da VPS
├── docs/             # CARGOS.md, HOSPEDAGEM.md
├── scripts/          # server-up, release/build, deploy-vps, check-migrations, e2e-*
└── frontend/         # cliente Electron + React (e app web)
    └── src/
        ├── main/     # processo principal do Electron
        ├── preload/  # bridge segura (IPC)
        ├── shared/   # código comum ao main e ao renderer (ex.: atividades)
        └── renderer/ # app React (api, store, components, pages, lib, overlay)
```

## 🚀 Como rodar

> **Hospedar para os amigos** (este PC como servidor, amigos baixam o `.exe` ou AppImage Linux x64):
> veja **[docs/HOSPEDAGEM.md](docs/HOSPEDAGEM.md)**.

### Distribuição desktop

A landing page (`site/`) oferece o instalador Windows e, para Linux x64, a
instalação de um comando (`curl -fsSL <site>/install.sh | sh`, sem FUSE nem
root, ver [docs/HOSPEDAGEM.md](docs/HOSPEDAGEM.md)) ou o AppImage.
No deploy automático, ambos usam a mesma versão e recebem atualizações
verificadas com assinatura Ed25519.

Para preparar um release local das duas plataformas (requer Docker):

```bash
scripts/release-win.sh 0.7.0
scripts/release-linux.sh 0.7.0
```

Defina `PUBLIC_URL` no ambiente ou em `backend/.env`. Os artefatos ficam em
`frontend/dist/` e os arquivos para publicação em `backend/updates/`.
No Linux, a instalação por comando se atualiza sozinha (sem FUSE nem root); o
AppImage precisa do `fusermount3` (FUSE 3) e de ficar numa pasta sua com permissão
de escrita. Compartilhamento de tela com áudio e inicialização
automática com o sistema continuam exclusivos do Windows.

### Pré-requisitos
- Go 1.26+
- Node.js 20+ e Yarn
- Docker (Postgres + LiveKit)

### 1. Servidor (Postgres + LiveKit + backend)
```bash
cp backend/.env.example backend/.env   # ajuste segredos e portas
scripts/server-up.sh
# API em http://localhost:$PORT (padrão 8080)
```

### 2. Frontend
```bash
cd frontend
yarn
VITE_SERVER_URL=http://localhost:8080 yarn dev
# sem VITE_SERVER_URL o app aponta para http://localhost:8080
```

**No navegador** (mesmo renderer, sem Electron; o backend fica na mesma origem):
```bash
cd frontend
yarn dev:web                         # http://localhost:5175, repassa /api /ws /rtc ao backend
yarn build:web && yarn preview:web   # dist-web/ em http://localhost:4173
# WEB_BACKEND_URL=http://localhost:8090 troca o backend do repasse
```

### 3. Testes
```bash
cd backend && go test ./...
# Testes que usam o Postgres de verdade (migrations, cargos e permissões); só rodam
# com um banco DESCARTÁVEL em TEST_DATABASE_URL (senão são pulados):
cd backend && TEST_DATABASE_URL=postgres://usuario:senha@localhost:5432/teste go test -p 1 ./...
cd frontend && yarn test
# E2E dos cargos em tempo real (backend ligado + banco descartável; Node 22+):
node scripts/e2e-roles-ws.mjs
# E2E de chamadas (dois navegadores com mídia fake) — ver cabeçalho do script:
node scripts/e2e-voice.mjs
# E2E do deploy sem queda: reinicia o backend no meio da chamada (Caddy + LiveKit
# locais) e confere voz, tela, LIVE, mudo e chat — ver cabeçalho do script:
node scripts/e2e-restart-call.mjs
# E2E do app web (login, DM com imagem, notificação, chamada + tela, reload, logout):
APP=http://localhost:4173/ node scripts/e2e-web.mjs
# E2E da supressão de ruído (RNNoise) e o RNNoise offline sobre um WAV:
node scripts/e2e-noise.mjs
node scripts/rnnoise-offline.mjs entrada.wav saida.wav
```

### Changelog (novidades por versão)

Todo PR de feature ou correção visível ao usuário cria um arquivo novo em `changelog/pending/` (`AAAA-MM-DD-assunto.md`), com as notas em `## Novidades` ou `## Correções` (linguagem de usuário, uma frase). O deploy envia a pasta na versão que subir (`scripts/publish-changelog.mjs`) e o servidor guarda nela só as notas de arquivos que nenhuma versão anterior trouxe; reescrever uma nota publicada não a faz sair de novo. Detalhes em `changelog/pending/README.md`.

## 🔌 API (resumo)

Autenticação via header `Authorization: Bearer <access_token>` (exceto rotas públicas de auth).

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/auth/register`, `/login`, `/refresh`, `/logout` | conta e sessão |
| POST | `/api/auth/verify-email`, `/resend-verification` | confirmação de e-mail |
| POST | `/api/auth/forgot-password`, `/reset-password` | recuperação de senha |
| ... | `/api/users/*` | perfil (`/me`, avatar, banner, status, privacidade, aniversário), busca, bloqueio, badges |
| ... | `/api/friends/*` | solicitações, lista, pendentes |
| ... | `/api/servers/*` | servidores, membros, convites, bans, apelidos, cargos |
| ... | `/api/servers/:id/channels` | canais (texto/voz) e sobrescritas |
| ... | `/api/channels/:channelId/messages` | mensagens, edição, reações e enquetes |
| ... | `/api/conversations/*` | DMs, grupos e mensagens |
| ... | `/api/calls/*` | criar/estado/encerrar chamadas, token LiveKit, moderação |
| ... | `/api/soundboard/*` | mesa de áudio |
| GET | `/api/presence?ids=` | status online |
| GET | `/api/presence/activities?ids=` | jogo em andamento de quem posso ver |
| GET | `/api/changelog` | novidades por versão (o deploy publica via `PUT /api/changelog/:versão` com `CHANGELOG_TOKEN`) |

> A lista completa de endpoints está no código (`internal/*/routes.go`).

## 📡 WebSocket

Endpoint: `GET /ws?token=<access_token>`.
O cliente entra em salas com `{"type":"subscribe","payload":{"room":"..."}}`
(`channel:`, `conversation:`, `server:`, `user:`, `call:`).

Eventos principais: `presence:update`, `presence:activity`, `message:create|update|delete`,
`message:reaction:*`, `message:poll:update`, `typing:*`, `channel:*`, `server:*`
(inclui `server:member:*` e `server:permissions:invalidate`), `role:*`,
`conversation:*`, `friend:request*|removed`, `level:*`, `badge:unlock`,
`soundboard:*` e `call:*` (ciclo de vida, atividades, LIVE e mesa de áudio).

## 📞 Chamadas (LiveKit)

- **Ciclo de vida** pelo WebSocket do backend (`call:invite`, `call:accept`,
  `call:leave`, `call:screen`...).
- **Mídia via SFU (LiveKit)**: cada pessoa envia uma cópia de cada track para o
  servidor, que distribui para os demais — aguenta ~10 pessoas com várias telas
  ao mesmo tempo e funciona mesmo atrás de CGNAT.
- O backend emite o token da sala (`POST /api/calls/:id/token`, só para
  participantes) e faz proxy de `/rtc` para o LiveKit local.
- **Som da tela** (Windows): compartilhando uma janela, vai só o som do app
  dela (helper nativo `native/concord-audio`, WASAPI process loopback);
  compartilhando a tela inteira, o som do sistema sem o da própria Salinha.
- **Fala, mudo e ensurdecido** visíveis para todos (lista do canal e tiles).
- **Dispositivos:** escolha de microfone e saída (Configurações → Voz).
- **Atividades:** o jogo abre numa janela própria (desktop) com sessão isolada;
  a VPS só repassa qual atividade está aberta e valida as origens permitidas.
- **Deploy sem queda:** reiniciar o backend não derruba a chamada em andamento.

## 🖥️ App desktop

- **Segundo plano** (Windows): fechar esconde na bandeja; instância única;
  iniciar com o Windows; notificações de chamada e DM.
- **Atualização automática** servida pelo próprio servidor (`/updates/`),
  com instaladores assinados (Ed25519): `scripts/release-win.sh` e
  `scripts/release-linux.sh`.
- **App web**: o mesmo renderer roda no navegador (`yarn dev:web`); a landing
  page com os downloads fica em `site/`.

## 🛠️ Scripts

### Backend
```bash
go run ./cmd      # inicia a API
go build ./...    # build
go vet ./...      # análise estática
```

### Frontend
```bash
yarn dev          # desenvolvimento
yarn build        # typecheck + build
yarn lint         # eslint
yarn typecheck    # tsc
yarn test         # vitest
yarn build:win    # instalador Windows (prefira scripts/build-win.sh)
yarn build:mac    # instalador macOS
yarn build:linux  # instalador Linux
```

## 🗺️ Roadmap

- [x] Auth, usuários, amigos, servidores e canais
- [x] Chat em tempo real (canais e DMs) + presença
- [x] Chamadas de voz (1:1 e grupo)
- [x] Compartilhamento de tela multi-tela
- [x] Vídeo (1:1 e multi-câmera em grupo)
- [x] SFU (LiveKit) — mídia passa pelo servidor
- [x] TLS (HTTPS/WSS) e deploy automático na VPS
- [x] Cargos e permissões por servidor e por canal
- [x] DMs em grupo, bloqueio e privacidade
- [x] Confirmação de e-mail e recuperação de senha
- [x] Mesa de áudio, supressão de ruído e overlay da chamada
- [x] Níveis e conquistas
- [x] Atividades na chamada (Krunker.io)
- [x] App web e AppImage para Linux
- [ ] Histórico de chamadas na UI

## 📚 Documentação

- [docs/HOSPEDAGEM.md](docs/HOSPEDAGEM.md): hospedar para os amigos e rodar numa VPS
- [docs/CARGOS.md](docs/CARGOS.md): cargos, permissões e hierarquia
- [docs/ATIVIDADE.md](docs/ATIVIDADE.md): jogo em andamento (rich presence)
- `FRONTEND_PLAN.md`, `PLANO_CALLS_WEBRTC.md` e `backend/MVP.md`: planos da fase inicial, mantidos como histórico

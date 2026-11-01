# 0042. Servidor próprio guiado por IA: build na própria VPS e app no navegador

- Status: aceito
- Data: 2026-11-01

## Contexto

O dono quer que alguém sem conhecimento de tecnologia mande o link do repo para
uma IA (Claude, ChatGPT/Codex, Gemini...) e saia com o próprio servidor da
Salinha no ar. A IA pode ter terminal (Claude Code, Codex CLI) ou só um chat, e a
máquina dela pode ser Windows. O caminho da Salinha oficial pressupõe a máquina
do dono (Linux, com Go, Node, Docker e `rsync`) ou o CI, e partes da VPS
(unit do backend, firewall, backup) estavam só descritas no HOSPEDAGEM.md.

A URL do servidor é constante de build no app desktop e no APK; o app web usa a
própria origem.

## Opções consideradas

1. **Build e deploy da máquina da IA** (`scripts/deploy-vps.sh root@IP`, como o
   dono faz). Exige bash, `rsync`, Go e Node onde a IA roda: falha no Windows e
   não existe num chat sem terminal.
2. **Fork + GitHub Actions desde o começo.** Funciona para todo mundo e traz
   instaladores, mas exige conta no GitHub, `gh`, secrets, chave de assinatura e
   página de download antes de ver qualquer coisa no ar.
3. **Clonar e compilar na própria VPS** e rodar o mesmo `deploy-vps.sh` para
   `root@localhost`. A IA só precisa de `ssh` (ou a pessoa cola blocos no
   console web do provedor); os amigos usam o app web, que não precisa de build
   por endereço.

## Decisão

Opção 3 como caminho principal; a 2 vira o passo opcional para quem quer
instaladores desktop com atualização automática. O PC com playit (HOSPEDAGEM.md,
seções 1 a 6) segue como alternativa sem VPS.

- Roteiro para a IA em `docs/ai/servidor-proprio.md`, com a conversa (perguntas
  na ordem, linguagem simples, confirmação antes de gastar) e os comandos.
- `scripts/make-env.sh` gera o `.env` (segredos sem aparecer na conversa,
  `LIVEKIT_NODE_IP` vazio na VPS) e troca linhas com `--set`;
  `scripts/self-update.sh` atualiza num comando (pull, app web, deploy local).
- `deploy/` ganha os modelos que faltavam: `Caddyfile.modelo` (um endereço para
  app web, API, chat, `/rtc`, `/healthz` e `/updates`), a unit do backend, o
  firewall nft, o SSH só por chave, o fail2ban e o backup diário.
- Sem domínio, o endereço é `<ip-com-hífens>.sslip.io`, como na Salinha oficial.
- Swap de 2 GB antes do build: o `yarn build:web` não cabe numa VPS de 2 GB.

## Consequências

- Mais disco na VPS (código, `node_modules`, Go): ~2 a 3 GB.
- O app web do servidor próprio monta o link de convite com a própria origem; o
  app desktop continua com o endereço oficial no link (mande o código).
- Sem SMTP, entrar num servidor por convite exige liberar a conta à mão (SQL no
  roteiro): o `RequireVerified` vale para todos.
- A VPS precisa ser x86/AMD64 (o deploy compila para `amd64`).

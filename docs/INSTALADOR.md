# Instalador: entrar num servidor ou hospedar o seu

A Salinha é open source: qualquer turma pode ter o próprio servidor. O
instalador fica no [GitHub Releases](https://github.com/hugoemannuel/concord/releases)
e, na primeira vez que abre, pergunta o que você quer fazer:

- **Entrar num servidor:** cole o endereço que te passaram e pronto.
- **Hospedar um servidor:** informe os dados da sua VPS; o app instala tudo
  lá (com HTTPS, voz e vídeo abertos para qualquer um) e devolve o endereço
  para mandar aos amigos.

O app oficial (salinha.bhrx.com.br) não muda: ele já vem com o servidor dele
embutido e nunca mostra essa tela.

## Para quem vai entrar

1. Baixe o instalador do release mais novo:
   - **Windows:** `Salinha-<versão>-setup.exe` (o Windows pode avisar "O
     Windows protegeu o computador": **Mais informações → Executar assim mesmo**).
   - **Linux x64:** `Salinha-<versão>-x64.AppImage` (permita executar nas
     propriedades do arquivo).
2. Abra e escolha **Entrar num servidor**.
3. Cole o endereço (ex.: `https://74-0-5-252.sslip.io`) e clique em **Conectar**.
   O app confere se é um servidor da Salinha no ar e reabre já nele.

Depois, o app se atualiza sozinho **pelo próprio servidor** (`/updates/`), na
mesma versão dele. Para trocar de servidor: **Configurações → Aplicativo →
Servidor → Trocar servidor** (sai da conta e volta para a tela inicial).

## Para quem vai hospedar

### Do que você precisa

- Uma **VPS** com **Debian 12+ ou Ubuntu 22.04+**, **x86_64**, 2 vCPU e 2–4 GB
  de RAM (o mesmo perfil da VPS oficial, [HOSPEDAGEM.md §7](HOSPEDAGEM.md)).
  Tráfego alto (~2–3 TB/mês com telas) e um datacenter perto da turma.
- O **acesso root** que o provedor mandou: senha ou chave SSH.
- Se o provedor tiver **firewall no painel** (security group), libere:

  | Porta | Para quê |
  |---|---|
  | 80/TCP | certificado HTTPS (Let's Encrypt) |
  | 443/TCP | app: API, chat e sinalização das chamadas |
  | 7881/TCP | mídia das chamadas (redes que bloqueiam UDP) |
  | 7882/UDP | mídia das chamadas |

  O `ufw` ou `firewalld` da própria VPS o instalador libera sozinho.

### Passo a passo

1. Abra o app e escolha **Hospedar um servidor**.
2. Informe o **IP da VPS**, o usuário (`root`) e a **senha** ou a **chave SSH**
   (e a senha da chave, se tiver). A senha só é usada na hora; não fica salva.
3. **Domínio próprio (opcional):** sem ele, o endereço é
   `https://<ip-com-hífens>.sslip.io` (HTTPS grátis, sem comprar nada). Com
   domínio, aponte o registro **A** dele para o IP da VPS **antes** de instalar.
4. **Atualizar sozinho** vem ligado: o servidor confere o GitHub Releases e
   instala a versão nova de madrugada (3h–6h), só com ninguém em chamada.
5. Clique em **Instalar na VPS**. As etapas aparecem na tela; leva poucos
   minutos. No fim: **Servidor no ar!**, o endereço e o botão **Copiar**.
6. **Entrar no meu servidor** liga o seu app a ele. Crie sua conta: sem SMTP
   configurado, as contas já nascem com o e-mail confirmado.

Instalar de novo na mesma VPS (para corrigir algo ou trocar o domínio) mantém
contas, mensagens e arquivos.

### O que o instalador faz na VPS

O app usa o `salinha-host` que vem dentro dele e, pelo SSH:

1. **Confere a VPS:** root, Linux x86_64, OpenSSL 3 e systemd. Na primeira
   conexão guarda a identidade da VPS; se ela mudar depois (VPS reinstalada ou
   alguém no meio), a instalação para e pede confirmação.
2. **Baixa o servidor** direto do GitHub Releases
   (`salinha-server-<versão>-linux-x64.tar.gz`) e **confere a assinatura
   Ed25519** com a chave pública que vem no app, antes de abrir qualquer coisa.
3. **Prepara a VPS** (como root): cria o usuário `salinha` (o Postgres não
   roda como root) e instala o `ffmpeg` e o `yt-dlp` do Maestro (bot de
   música; se não der, o servidor funciona e só o Maestro fica fora do ar).
4. **Configura** (como `salinha`): portas livres, segredos novos (`JWT`,
   LiveKit, senha do banco), Postgres portátil, banco e migrations, LiveKit
   (igual ao `docker-compose.yml`) e o Caddy (igual ao `deploy/Caddyfile`:
   `/rtc` direto no LiveKit, `/updates` do disco).
5. **Liga** pelo systemd (`salinha-server.service`, `User=salinha`, religa
   sozinho e sobe com a VPS) e libera o firewall.
6. **Confere de fora**, pela internet: `https://…/healthz` responde `200` e
   `/rtc/validate` responde `401` (o LiveKit), como o deploy oficial confere.

Tudo fica em `/opt/salinha-server`:

```text
/opt/salinha-server/
  app/        versão atual (bin/, migrations/, updates/ com o app da mesma versão)
  app.prev/   versão anterior (para voltar)
  data/       .env, host.json, Caddyfile, livekit.yaml, pgdata/, uploads/, caddy/, logs/
```

### Atualizações

Sem servidor nosso no meio e sem telemetria: o servidor só **baixa arquivos
públicos** do GitHub Releases.

- A cada 30 min, de madrugada, o servidor lê `server-latest.yml` do release
  mais novo. Versão nova e ninguém em chamada: baixa, confere o sha512 e a
  **assinatura Ed25519** (chave pública embutida; a privada só existe no
  secret do GitHub Actions) e prepara em `app.new/`.
- O supervisor sai, o systemd o religa e o `salinha-host pre-start` troca
  `app → app.prev` e `app.new → app`. A versão nova no ar confirma; se ela não
  subir em 2 partidas, volta sozinha para a anterior.
- O pacote novo traz o app da mesma versão em `updates/`: os amigos recebem a
  atualização do app pelo servidor logo depois.
- Atualizar agora (pelo SSH, como root):
  `/opt/salinha-server/app/bin/salinha-host update`.

### Manutenção na VPS

```bash
systemctl status salinha-server              # está no ar?
/opt/salinha-server/app/bin/salinha-host status
journalctl -u salinha-server -f              # supervisor
ls /opt/salinha-server/data/logs/            # postgres, livekit, backend, caddy, update
systemctl restart salinha-server
```

**Backup:** o que importa está em `/opt/salinha-server/data` (o banco em
`pgdata/`, a mídia em `uploads/`, os segredos no `.env`). Pare o serviço
(`systemctl stop salinha-server`) e copie a pasta, ou use `pg_dump` com o
`DATABASE_URL` do `.env` (o Postgres escuta só em `127.0.0.1`).

**Desinstalar:**

```bash
systemctl disable --now salinha-server
rm /etc/systemd/system/salinha-server.service && systemctl daemon-reload
rm -rf /opt/salinha-server && userdel salinha
```

### Problemas comuns

| Mensagem | O que fazer |
|---|---|
| "usuário, senha ou chave recusados pela VPS" | confira a senha/chave; algumas VPS exigem trocar a senha do root no primeiro acesso pelo painel |
| "não deu para conectar na VPS" | IP errado ou porta 22 fechada no painel do provedor |
| "entre com o usuário root da VPS" | o instalador precisa do root (não só sudo) |
| "a VPS precisa do OpenSSL 3" | use Debian 12+ ou Ubuntu 22.04+ |
| "o servidor não respondeu em https://…" | portas 80/443 bloqueadas no painel do provedor, ou o domínio ainda não aponta para a VPS |
| voz/vídeo não conectam, chat funciona | portas 7881/TCP e 7882/UDP bloqueadas no painel do provedor |

## Para quem mantém o projeto

- **Publicar uma versão:** `git tag v0.9.0 && git push origin v0.9.0`. O
  workflow [`release.yml`](../.github/workflows/release.yml) testa o servidor,
  roda `scripts/release-oss.sh` e cria o GitHub Release com o app genérico
  (Windows e Linux), o pacote do servidor, `server-latest.yml` e `SHA256SUMS`.
- **Chave:** secret `RELEASE_KEY_OSS` (`openssl genpkey -algorithm ed25519`).
  É **separada** da `RELEASE_KEY` da VPS oficial: se uma vazar, a outra não é
  afetada, e o app oficial continua aceitando só a dele. Perder a chave quebra
  as atualizações automáticas de todos os servidores instalados.
- **Local:** `scripts/release-oss.sh <versão>` (Docker; gera
  `backend/.release-key-oss` na primeira vez, guarde um backup). Pacote do
  servidor sozinho: `scripts/package-server.sh <versão>`. App genérico
  sozinho: `scripts/build-win.sh --generic` / `scripts/build-linux.sh --generic`.
- **Versões fixas** do que vai no pacote do servidor (em
  `scripts/package-server.sh`): LiveKit (a mesma do `docker-compose.yml`),
  Postgres portátil (zonky) e Caddy.
- **Testes:** `go test ./internal/hostkit/` e o E2E
  [`scripts/e2e-instalador.mjs`](../scripts/e2e-instalador.mjs), que instala
  numa VPS falsa (contêiner Debian 12 com SSH) pela tela do app e conecta um
  segundo perfil (o cabeçalho explica como montar).
- **Dev:** `yarn dev` continua falando com o backend local (sem tela
  inicial). Para ver a tela inicial: `npx electron-vite build` sem
  `VITE_SERVER_URL` e `npx electron-vite preview` (usa o perfil normal da
  Salinha em `%APPDATA%\Concord`: feche a Salinha instalada antes, ou use o
  perfil temporário do E2E).

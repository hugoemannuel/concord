# Hospedar a Salinha para os amigos

Este PC é o servidor (backend + Postgres + LiveKit). O **playit.gg** leva o
tráfego da internet até ele sem abrir porta no roteador. Os amigos só baixam e
abrem o `.exe`.

```text
Amigo (.exe) ──► playit ──► este PC
                 ├─ TCP  → backend (API, chat, sinalização /rtc)
                 ├─ UDP  → LiveKit (voz/vídeo/tela)
                 └─ TCP  → LiveKit (fallback de mídia p/ redes que bloqueiam UDP)
```

## 1. Preparar o PC

- **Cabo de rede** (não Wi-Fi) e **sem suspender**: configure o sistema para
  não dormir, nem com a tampa fechada.
- Docker, Go e Node instalados.

## 2. Configurar o servidor

```bash
cp backend/.env.example backend/.env
```

Edite `backend/.env`:

- `JWT_SECRET` e `LIVEKIT_API_SECRET`: gere com `openssl rand -hex 32`. Sem
  `JWT_SECRET` (ou com menos de 32 caracteres, ou o valor do `.env.example`)
  o backend não sobe: não existe mais segredo padrão no código.
- `PORT`: porta do backend. Se a 8080 já estiver em uso, troque (ex.: `8090`).
- `POSTGRES_PORT` e a porta no `DATABASE_URL`: troque se a 5432 estiver em uso.
- As portas do LiveKit e o `LIVEKIT_NODE_IP` saem do passo 3 (só com playit;
  numa VPS, deixe `LIVEKIT_NODE_IP` vazio — seção 7).

## 3. Criar os túneis no playit

1. Baixe o agente do playit (`playit` e `playit-cli`, em
   [playit.gg/download](https://playit.gg/download) ou nas releases do
   [playit-agent](https://github.com/playit-cloud/playit-agent/releases)) e
   coloque no `PATH`. Depois instale os serviços (seção 4) e vincule o agente
   à sua conta. O comando abaixo mostra um link para abrir no navegador:
   ```bash
   scripts/install-services.sh
   playit-cli --socket-path ~/.local/share/playit/playitd.sock setup
   ```
2. No painel do playit.gg, crie **3 túneis**, todos apontando para `127.0.0.1`:

   | Túnel | Tipo | Porta local |
   |---|---|---|
   | Salinha API | TCP | o `PORT` do `.env` (padrão 8080) |
   | Salinha mídia | **UDP** | **igual à porta pública** que o playit der |
   | Salinha mídia TCP | TCP | **igual à porta pública** que o playit der |

   Os dois túneis de mídia precisam ter **porta local = porta pública**, porque
   o LiveKit informa a própria porta aos clientes. Exemplo: se o túnel UDP
   ganhou `abc.gl.at.ply.gg:41234`, a porta local dele também é `41234`.
3. Ponha essas portas no `.env`:
   ```env
   LIVEKIT_UDP_PORT=41234   # porta do túnel UDP
   LIVEKIT_TCP_PORT=41890   # porta do túnel "mídia TCP"
   ```
4. Descubra o IP público do túnel UDP e ponha em `LIVEKIT_NODE_IP`. Aqui o
   valor é necessário: o PC está atrás de NAT, o LiveKit só enxerga IPs
   locais e, sem isso, anunciaria aos amigos um endereço que eles não
   alcançam:
   ```bash
   scripts/playit-ip.sh abc.gl.at.ply.gg
   ```
   Rode também para o túnel "mídia TCP". Se der o **mesmo IP**, o fallback TCP
   funciona; se der outro, só o UDP funciona (normalmente basta).

> Túneis TCP/UDP genéricos exigem o **playit premium** (~US$ 3/mês). A
> alternativa é uma VPS (seção 7). O túnel "mídia TCP" é opcional: só ajuda
> quem está em rede que bloqueia UDP.

## 4. Subir o servidor

```bash
scripts/server-up.sh
```

Sobe Postgres + LiveKit no Docker e roda o backend. Para conferir:
`curl http://127.0.0.1:$PORT/rtc/validate` deve responder `401` (é o LiveKit
recusando a requisição sem token, sinal de que o proxy funciona).

### Rodar sempre (serviços do usuário)

Para o servidor e o playit subirem sozinhos, instale os serviços systemd do
usuário. São três: `concord-server` (backend), `concord-playit` (agente do
playit) e `concord-playit-watchdog` (vigia do túnel):

```bash
scripts/install-services.sh
systemctl --user status concord-server       # ver se está rodando
journalctl --user -u concord-server -f       # logs
journalctl --user -u concord-playit-watchdog # o que o vigia fez
```

O agente do playit às vezes perde a sessão e para de repassar conexões sem
avisar. O vigia testa o endereço público (`PUBLIC_URL` no `.env`) a cada
minuto e reinicia o playit depois de 2 falhas seguidas.

O `concord-server` roda o binário `backend/concord-server`. Depois de
atualizar o código: `cd backend && go build -o concord-server ./cmd &&
systemctl --user restart concord-server`. O Postgres e o LiveKit sobem
sozinhos pelo Docker (`restart: unless-stopped`).

## 5. Publicar o app para os amigos (com atualização automática)

Defina `PUBLIC_URL` no `backend/.env` com o endereço público do túnel
**Salinha API** (ex.: `http://abc-api.gl.at.ply.gg:12345`) e rode:

```bash
scripts/release-win.sh          # ou: scripts/release-win.sh 0.3.0
scripts/release-linux.sh        # usa a mesma versão do package.json, sem incrementá-la
```

O script faz quatro coisas:

1. Na primeira vez, gera a **chave de assinatura** em `backend/.release-key`.
   Faça backup dela e não compartilhe: sem ela, os apps já instalados recusam
   as atualizações.
2. Sobe a versão em `frontend/package.json`.
3. Gera e assina o instalador com o endereço e a chave pública embutidos.
4. Publica tudo em `backend/updates/`, que o backend serve em `/updates/`.

**Primeira vez de cada amigo:** mande `frontend/dist/Salinha-<versão>-setup.exe`.
Como o app não é assinado, o Windows mostra "O Windows protegeu o
computador". Basta clicar em **Mais informações → Executar assim mesmo**.

**Linux x64 (recomendado):** mande o link da landing page ou o comando, que
roda no terminal como usuário normal (sem `sudo`):

```bash
curl -fsSL https://salinha.bhrx.com.br/install.sh | sh
```

Ele instala em `~/.local/share/salinha/versions/<versão>/` (um `.tar.gz` por
versão), aponta `~/.local/share/salinha/current` para ela e cria o comando
`~/.local/bin/salinha` e o atalho `~/.local/share/applications/salinha.desktop`.
Não precisa de FUSE, root nem pacote nenhum (só `tar`, `sha512sum` e `curl` ou
`wget`, que toda distribuição traz). O instalador confere tamanho, sha512 e,
com OpenSSL 3, a **assinatura Ed25519** do pacote com a chave pública que o
`deploy-vps.sh` embute nele (`scripts/embed-pubkey.sh`; o CI confere que é a
mesma chave das atualizações). Sem OpenSSL 3 ele só aceita HTTPS; por HTTP
puro, só com a assinatura conferida. O script inteiro fica numa função chamada
na última linha: um download cortado no meio não executa nada.

Daí em diante o próprio app se atualiza: busca o `.sig` primeiro, baixa o
`.tar.gz`, confere sha512 e a assinatura, extrai numa pasta nova (dos mesmos
bytes conferidos) e troca o `current` de uma vez, guardando a versão anterior.
Atualização recusada (assinatura ou pacote inválido) fica anotada com o sha512
e não é baixada de novo; falhas de rede esperam cada vez mais (1 min, 5 min,
30 min, 2 h, até 6 h) em vez de baixar ~140 MB a cada checagem.

**Volta automática:** se a versão nova não confirmar que abriu (o app confirma
após 10 s aberto) em 2 partidas, a 3ª partida volta para a anterior. A versão
ruim vai para `~/.local/share/salinha/bad-versions` e os arquivos dela são
apagados; o app não a oferece de novo, só uma versão estritamente mais nova
(que limpa a lista). Partidas com a Salinha já aberta não contam. Migração (a
mesma versão, vinda do AppImage extraído) e versões ruins nunca instalam
sozinhas ao abrir, só com o clique em Atualizar.

Para outro servidor (só HTTPS): `curl -fsSL https://<endereço>/install.sh | SALINHA_URL=https://<endereço> sh`.
Para remover: `rm -rf ~/.local/share/salinha ~/.local/bin/salinha
~/.local/share/applications/salinha.desktop` (e `sudo rm -f
/etc/apparmor.d/salinha`, se instalou o perfil). Login e configurações ficam em
`~/.config/Concord`. Erros de atualização: `~/.config/Concord/logs/update.log`.

**Sandbox:** sem root não existe o `chrome-sandbox` SUID, então o Chromium usa o
sandbox de user namespaces do kernel, ligado na maioria das distribuições. Dois
casos não deixam:

- **Ubuntu 24.04+ (AppArmor restringe user namespaces):** o instalador
  pergunta *"Instalar perfil do AppArmor para manter a proteção (sandbox)?
  Precisa de sudo. [s/N]"*. Com **s**, grava `/etc/apparmor.d/salinha` (perfil
  mínimo, só para `~/.local/share/salinha/versions/*/salinha`) e o recarrega:

  ```
  abi <abi/4.0>,
  include <tunables/global>

  profile salinha "/home/<você>/.local/share/salinha/versions/*/salinha" flags=(unconfined) {
    userns,

    include if exists <local/salinha>
  }
  ```

  Para fazer depois: rode o instalador de novo e responda **s** (ou
  `SALINHA_APPARMOR=s` sem terminal), ou grave o arquivo acima à mão e rode
  `sudo apparmor_parser -r /etc/apparmor.d/salinha`.
- **Sem o perfil, ou com user namespaces desligados**
  (`kernel.unprivileged_userns_clone=0`, `user.max_user_namespaces=0`): o
  lançador abre com `--no-sandbox` como último recurso, registra em
  `~/.local/share/salinha/launcher.log` e o app mostra **uma vez** o aviso
  *"Proteção do navegador (sandbox) desativada neste sistema — veja como
  ativar"*, com link para a página de download (`#sandbox`). No Debian, os
  user namespaces voltam com `sudo sysctl -w kernel.unprivileged_userns_clone=1`.

`SALINHA_SANDBOX=1` ou `0` força. O lançador também descarta `APPIMAGE`/`APPDIR`
herdados (terminal aberto dentro de outro AppImage), e o app só usa o
electron-updater quando roda de dentro do próprio AppImage montado.

**Quem usa o AppImage extraído** (por exemplo em `~/.local/opt/salinha`, com o
lançador `~/.local/bin/salinha`): rode o mesmo comando uma vez. Ele guarda o
lançador e o atalho antigos em `~/.local/share/salinha/legacy/` e avisa a pasta
antiga, que pode ser apagada. A partir desta versão, um AppImage extraído
também migra sozinho: ele oferece "Atualizar" para a mesma versão, que instala
no layout novo e reabre por ele.

**Linux x64 (AppImage):** `frontend/dist/Salinha-<versão>-x64.AppImage`, ou o
botão da landing page. Nas propriedades do arquivo, permita executar como
programa (ou use `chmod +x`) e abra-o como usuário normal. O AppImage usa o
runtime estático (AppImage/type2-runtime): só precisa do `fusermount3` (FUSE 3),
não da libfuse2. Guarde-o numa pasta sua com permissão de escrita: o
atualizador (electron-updater) substitui o arquivo nessa pasta.

O release Linux usa a mesma chave Ed25519 do Windows e publica o AppImage, o
`.tar.gz`, os `.sig` de cada um, `latest-linux-tar.yml` (o do `.tar.gz`) e
`latest-linux.yml` (o do AppImage), nessa ordem. O Windows continua usando
`latest.yml`.
Para manter versões iguais, execute o release Windows e depois o Linux,
ou passe explicitamente a mesma versão aos dois scripts. Ambos precisam
terminar com sucesso antes de executar o deploy. No CI isso é obrigatório.

**Depois disso, não precisa mandar mais nada.** Para cada versão nova, rode
`scripts/release-win.sh` e depois `scripts/release-linux.sh` de novo:

- O app checa atualizações ao abrir, a cada minuto e quando o servidor avisa
  de versão nova.
- Ele baixa a versão nova em segundo plano, também durante chamada. Na VPS
  com o CI, os arquivos vêm da GitHub Release e não do upload do servidor
  (veja [Atualizações pelo GitHub Releases](#atualizações-do-app-pelo-github-releases)).
- Instaladores sem assinatura válida são recusados.
- Se já estava baixada, a atualização instala ao abrir o app. Com o app aberto,
  aparece **"Nova atualização disponível"** no canto inferior direito, com o
  botão **Atualizar**.

> `scripts/build-win.sh <endereço>` ainda gera um `.exe` avulso (portable +
> instalador), mas sem atualização automática.
> Para um AppImage e um `.tar.gz` avulsos: `scripts/build-linux.sh <endereço>`.

### No app (Linux)

- Chat, voz e vídeo precisam ser validados na distribuição de destino.
- Compartilhamento de tela é **sem áudio**; o helper de áudio é exclusivo do Windows.
- No Wayland, a captura depende do portal de compartilhamento do ambiente gráfico.
- Não há promessa de fechar para a bandeja nem de iniciar com o sistema no Linux.
- Para validar um release: abrir o app (instalação por comando e AppImage),
  entrar na conta, enviar mensagem, testar microfone/câmera e compartilhar tela.
  Depois publicar uma segunda versão e conferir download, assinatura e troca
  (do `current` e do AppImage), inclusive adiamento do download durante
  chamadas. Conferir também uma sessão X11 e Wayland.

### No app (Windows)

- **Fechar a janela** deixa o app na bandeja, como o Discord. Para fechar de
  vez, use **Sair** no ícone da bandeja.
- **Iniciar com o Windows** vem ligado e pode ser desligado nas configurações.
- **Configurações → Voz:** escolha do microfone e da saída de som.
- **Som da tela compartilhada:**
  - Ao compartilhar uma **janela**, vai só o som do app dela (Windows 10 2004
    ou mais novo).
  - Ao compartilhar a **tela inteira**, vai o som do PC todo, menos o da Salinha.

## 6. Testar

- Você (no desktop) e um amigo de **outra rede**: criar conta, virar amigos,
  entrar num canal de voz.
- Duas pessoas compartilhando tela ao mesmo tempo, com som de jogo/vídeo.
- Se a chamada abre mas fica sem áudio/vídeo, quase sempre é porta local ≠
  porta pública no túnel de mídia, ou `LIVEKIT_NODE_IP` errado (no playit) ou
  preenchido (numa VPS, onde deve ficar vazio). Veja `docker logs
  concord-livekit`.
- **Só quem tem IPv6 conecta na call** (quem só tem IPv4 não entra, e o
  LiveKit não mostra erro): num servidor com IP público (VPS), é o
  `LIVEKIT_NODE_IP` preenchido. Esvazie no `.env` e recrie o LiveKit
  (`scripts/deploy-vps.sh --infra root@IP`; derruba as chamadas em andamento).
- Quem está na **mesma rede** que o servidor (o seu desktop) conecta a mídia
  direto pela rede local, sem passar pelo playit.

## 7. Rodar numa VPS (recomendado)

Numa VPS com IP público não precisa de playit, e dá para ter HTTPS de graça.

1. **VPS:** Debian 13 ou Ubuntu 24.04, 2 vCPU, 2–4 GB de RAM, tráfego alto
   (~2–3 TB/mês com telas) e portas UDP liberadas. Datacenter perto do grupo.
2. **Instale** Docker (repositório oficial), `caddy` e `rsync`.
3. **`/opt/concord/.env`** (a partir do `backend/.env.example`):
   - `HOST=127.0.0.1`, para o backend escutar só local, atrás do Caddy;
     com isso o backend confia no `X-Forwarded-For` só quando a conexão vem
     do loopback (o Caddy), e o limite de tentativas de login usa o IP real.
     `TRUSTED_PROXIES` troca essa escolha (veja o `.env.example`);
   - `LIVEKIT_NODE_IP` **vazio** (não ponha o IP da VPS): o LiveKit descobre o
     IP sozinho. Em 2026-10-30, com o IP público preenchido, ele passou a
     ignorar todo pedido de conexão ICE por IPv4 e só quem tinha IPv6
     entrava na call. O valor só é necessário no playit (seção 3);
   - `LIVEKIT_UDP_PORT=7882` e `LIVEKIT_TCP_PORT=7881` (sem túnel, as portas
     são as mesmas);
   - `PUBLIC_URL=https://<seu-endereço>`;
   - os segredos (`JWT_SECRET` e as chaves do LiveKit). Usando os mesmos de
     antes, ninguém perde o login;
   - `UPLOADS_DIR` (opcional; padrão `uploads`, que vira `/opt/concord/uploads`
     porque o serviço roda com `WorkingDirectory=/opt/concord`): fotos, vídeos
     e áudios do chat;
   - `UPLOADS_MIN_FREE_GB` (opcional; padrão 5): abaixo desse espaço livre no
     disco o servidor recusa uploads novos.
4. **Endereço com HTTPS sem comprar domínio:** use `<ip-com-hífens>.sslip.io`
   (ex.: `74-0-5-252.sslip.io` aponta para `74.0.5.252`). O `/etc/caddy/Caddyfile`
   é o [`deploy/Caddyfile`](../deploy/Caddyfile) do repositório (veja
   [Caddyfile](#caddyfile-todos-os-endereços-da-vps)). O Caddy tira o
   certificado sozinho. Use o Caddy **2.7 ou mais novo, do repositório
   oficial** (veja [Caddy e o reload](#portas-abertas-na-vps)); o 2.6.2 do `apt`
   do Debian recusa o `stream_close_delay`. O arquivo precisa ser legível pelo
   usuário `caddy` (`chmod 644`).
5. **Serviço do backend:** `/etc/systemd/system/concord-server.service`, com
   `WorkingDirectory=/opt/concord`, `ExecStart=/opt/concord/concord-server` e
   `Restart=always`, mais:
   - o complemento
     [`deploy/concord-server.service.d/zero-downtime.conf`](../deploy/concord-server.service.d/zero-downtime.conf)
     em `/etc/systemd/system/concord-server.service.d/`;
   - o socket [`deploy/concord-server.socket`](../deploy/concord-server.socket)
     em `/etc/systemd/system/` (a porta fica com o systemd e não fecha no
     reinício).

   Numa VPS nova: `systemctl daemon-reload && systemctl enable --now
   concord-server.socket concord-server`. Numa VPS que já roda, siga
   [Ordem dos passos na VPS](#ordem-dos-passos-na-vps).
6. **Do seu PC:** `scripts/deploy-vps.sh root@IP` envia o backend, as
   migrations, o compose, a página de download (`site/`), o app web
   (`frontend/dist-web`, se existir) e as atualizações do app, e reinicia.
   Reiniciar não derruba quem está em chamada, não trava a voz/tela e não
   perde requisição (veja [Reinício sem queda](#reinício-do-backend-sem-queda)).
7. **Publicar versão do app:** `scripts/release-win.sh`, `scripts/release-linux.sh` e depois
   `scripts/deploy-vps.sh root@IP`.

### Caddyfile: todos os endereços da VPS

O [`deploy/Caddyfile`](../deploy/Caddyfile) é a cópia versionada do
`/etc/caddy/Caddyfile` da VPS, com os blocos que estão no ar:

| Bloco | Para quê |
|---|---|
| `74-0-5-252.sslip.io` | `PUBLIC_URL` dos apps desktop: `/rtc*`, `/updates/*` e o backend |
| `salinha.bhrx.com.br` | página de download (`/opt/concord/site`) e `/updates/*` |
| `concord.bhrx.com.br` | redireciona para `salinha.bhrx.com.br` |
| `app-salinha.bhrx.com.br` | app no navegador (`/opt/concord/web`), `/rtc*`, `/api`, `/ws`, `/updates/*`; também o endereço alternativo do app desktop |

Os dois `bhrx.com.br` estão atrás do proxy do Cloudflare (nuvem laranja) e
funcionam assim, inclusive os WebSockets e o `/rtc` do app web.

- **`/rtc*` vai direto para o LiveKit** (`127.0.0.1:7880`, o `LIVEKIT_PORT`),
  sem passar pelo backend. Antes, a sinalização do LiveKit passava pelo
  backend: cada deploy cortava essa conexão, o cliente fazia um "ICE restart"
  e a voz e a tela de todo mundo travavam por 0,3–1 s ao mesmo tempo. O app já
  pede `/rtc` no mesmo endereço da API, então funciona **sem atualizar o app**.
  Está no bloco do `PUBLIC_URL` e no app web (`import salinha_rtc`);
  um bloco novo que sirva o app precisa do mesmo `import`.
- **`/updates/*`:** os manifestos (`latest*.yml`) vêm do disco
  (`/opt/concord/updates`); os instaladores, `.blockmap` e `.sig`
  (`Salinha-<versão>-…`) respondem `302` para a GitHub Release da versão
  (veja [Atualizações pelo GitHub Releases](#atualizações-do-app-pelo-github-releases)).
- **Sem health check ativo:** com o socket do systemd, a porta do backend não
  fecha no reinício; o Caddy conecta na hora e a requisição espera na fila até
  o processo novo atender. `lb_try_duration 15s` só entra com o backend parado
  de verdade.
- **`keepalive off`** com o backend: no desligamento ele fecha as conexões
  ociosas, e um POST mandado numa conexão reaproveitada daria 502.
- O proxy `/rtc` do backend continua para o PC de casa com playit (um túnel
  TCP só, sem Caddy). Lá, reiniciar o backend ainda trava a voz por um instante.

### Portas abertas na VPS

Só ficam abertas para a internet as portas que o app usa: `22` (SSH), `80` e
`443` TCP/UDP (Caddy: HTTPS e o redirecionamento do HTTP) e as do LiveKit
(`7881/tcp`, `7882/udp` e as UDP dos candidatos ICE). Postgres, a API do
LiveKit, o Prometheus, o admin do Caddy e o backend ficam em `127.0.0.1`.
Confira com `ss -tulnp`.

- **`:8080` (HTTP puro) saiu em 2026-10-31.** Era o repasse dos apps que
  ainda falavam com o endereço do playit, e servia o app inteiro (API, WS com
  o token na URL, `/rtc`, updates) sem criptografia. Antes de tirar: o Caddy
  não tem access log e o journal do backend não guarda o Host (e só cobre
  ~2 dias), então não há como ver 2 semanas de uso; a evidência foi o journal
  do Caddy de 14 dias (nada da 8080), zero conexões no conntrack (que guarda
  conexões estabelecidas por até 5 dias), zero conexões abertas e zero SYN
  em amostras com `tcpdump` (com a 443 ativa na mesma hora), e nenhum agente
  do playit rodando (o `concord-relay` do PC de casa ainda existe, mas sem o
  playit nada de fora chega nele; pode ser removido com
  `docker rm -f concord-relay`). Para voltar, recoloque o bloco
  `:8080 { import salinha_app }` e aplique com o `scripts/apply-caddyfile.sh`.
- **LLMNR desligado em 2026-10-31.** O `systemd-resolved` escutava a `5355`
  (TCP e UDP, em `0.0.0.0` e `[::]`) para resolução de nomes na rede local,
  que não tem uso numa VPS. Drop-in em
  `/etc/systemd/resolved.conf.d/10-sem-llmnr.conf`:

  ```ini
  [Resolve]
  LLMNR=no
  ```

  Depois: `systemctl restart systemd-resolved`, conferir que `ss -tulnp | grep 5355`
  não mostra nada, que `getent hosts github.com` resolve e que backend
  (`curl 127.0.0.1:8090/healthz`) e LiveKit (`curl 127.0.0.1:7880/`) seguem
  respondendo.
- **SSH só por chave (2026-11-01).** O provedor deixa `01-meteorcloud.conf` e
  `50-cloud-init.conf` ligando a senha, e no sshd vale o primeiro valor lido;
  por isso o drop-in tem nome que vem antes deles,
  `/etc/ssh/sshd_config.d/00-salinha.conf`:

  ```
  PasswordAuthentication no
  KbdInteractiveAuthentication no
  PermitRootLogin prohibit-password
  ```

  Depois: `sshd -t && systemctl reload ssh`. Antes de mexer, confira que a sua
  chave está em `/root/.ssh/authorized_keys` e teste uma conexão nova por chave
  com a atual ainda aberta. Eram ~13 mil tentativas de senha por dia.
- **fail2ban (2026-11-01):** `/etc/fail2ban/jail.d/salinha-sshd.local`
  (`backend = systemd`, 5 erros em 10 min = 1 h de bloqueio). Ver com
  `fail2ban-client status sshd`.
- **Firewall (2026-11-01):** tabela nft própria, `/etc/salinha-firewall.nft`,
  carregada pelo `salinha-firewall.service` (habilitado no boot). Entra só o
  que foi aberto acima (`22`, `80`, `443` TCP, `443` UDP, `7881/tcp`,
  `7882/udp`) mais conexões já estabelecidas, `lo`, as pontes do Docker e
  ICMP. É uma tabela separada (`inet salinha_fw`), então não apaga nem mexe nas
  regras do Docker; **nunca use um `/etc/nftables.conf` com `flush ruleset`**,
  que derrubaria a rede dos containers. Para abrir uma porta nova: edite o
  arquivo, `nft -c -f /etc/salinha-firewall.nft` e
  `systemctl restart salinha-firewall`. Para testar uma mudança sem risco de
  ficar trancado: `systemd-run --unit=salinha-fw-rollback --on-active=600 nft
  delete table inet salinha_fw` antes de aplicar e `systemctl stop
  salinha-fw-rollback.timer` depois de conferir (SSH novo, site, e alguém
  entrando numa call com áudio).

**Caddy e o reload.** A VPS roda o Caddy do repositório oficial (Cloudsmith),
**2.11.7 desde 2026-11-01** (antes, o 2.6.2 do Debian). O `deploy/Caddyfile`
tem `stream_close_delay 12h` nos `reverse_proxy` de `salinha_rtc` e
`salinha_backend`: num `systemctl reload caddy`, os WebSockets abertos (chat e
sinalização do LiveKit) continuam na config antiga por até 12 h em vez de cair
na hora, e quem reconecta já cai na config nova. Sem isso (o 2.6.2 não tem a
opção), **todo reload fechava todos os WebSockets**: o chat reconectava em
instantes e quem estava em chamada perdia a sinalização (a chamada reconectava
com uma travada de ~1 s). Testado no 2.11.7: WebSocket parado por mais de
1 min não cai (os timeouts de inatividade do 2.11.6 só cortam escrita
travada), o reload mantém o WebSocket aberto e `stop`/`restart` fecha tudo na
hora (sem esperar as 12 h; a unidade tem `TimeoutStopSec=5s`). O script abaixo
continua conferindo que ninguém está em chamada, por garantia.

Parar ou reiniciar o Caddy (inclusive a atualização do pacote) ainda fecha
todos os WebSockets: faça com ninguém em chamada. O pacote do Cloudsmith não
entra no `unattended-upgrades` (que só pega o Debian), então atualizar é
manual. Para instalar numa VPS nova ou atualizar:

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt update
# Antes de trocar: valide o Caddyfile com o binário novo, sem instalar.
cd "$(mktemp -d)" && apt-get download caddy && dpkg-deb -x caddy_*.deb x &&
  x/usr/bin/caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
# Guarde o pacote atual (volta: dpkg -i ou apt install --allow-downgrades caddy=<versão>).
cp /var/cache/apt/archives/caddy_*.deb /root/ 2>/dev/null; cp -p /usr/bin/caddy /root/caddy-$(caddy version | cut -d' ' -f1).bin
# confold: mantém o /etc/caddy/Caddyfile da VPS (o pacote traz um de exemplo).
apt-get install -y -o Dpkg::Options::=--force-confold caddy   # reinicia: os WebSockets caem uma vez
caddy version
curl -s -o /dev/null -w '%{http_code}\n' https://74-0-5-252.sslip.io/rtc/validate   # 401
```

Mudanças do 2.6 para o 2.11 que importam aqui (o `caddy adapt` do nosso
Caddyfile gera o mesmo JSON nas duas versões): cabeçalhos da requisição
limitados a 16 KiB (`431` acima disso; os tokens vão na URL, bem menores) e
cabeçalhos com `_` ou `.` no nome descartados (o app não usa nenhum).

**Aplicar o Caddyfile:** use o script, que roda na VPS, nesta ordem: valida o
arquivo; confere que o backend responde `/healthz`; confere no banco que
ninguém está em chamada (senão para, a não ser com `--force`); guarda backup
do atual; recarrega; testa `/rtc/validate` = 401 (o LiveKit), `/healthz`,
`/updates/latest.yml` e o instalador que ele cita (seguindo o redirect para o
GitHub) pelo `PUBLIC_URL` e `/rtc/validate` nos endereços de `--also`; se algo
falhar, volta o backup.

```bash
scripts/apply-caddyfile.sh --also https://app-salinha.bhrx.com.br root@IP deploy/Caddyfile
```

### Atualizações do app pelo GitHub Releases

Decisão e alternativas: [ADR 0028](adr/0028-atualizacoes-pelo-github-releases.md).
A cada deploy da `main`, o CI:

1. gera e assina os instaladores (`release-win.sh`, `release-linux.sh`) em
   `backend/updates/`;
2. publica a **GitHub Release `v<versão>`** (`scripts/github-release.mjs`, com o
   `GITHUB_TOKEN` do Actions): cria rascunho com instaladores, `.blockmap`,
   `.sig` e `latest*.yml`, e só então a torna pública e "Latest". As notas são
   as entradas do `changelog/next.md` que a release anterior não trouxe.
   Re-run na mesma versão apaga a release e a tag e cria de novo;
3. envia tudo para a VPS (`deploy-vps.sh`), com os `latest*.yml` por último,
   depois do backend novo no ar, como antes. A cópia dos instaladores na VPS
   fica só como reserva: o Caddy não a serve;
4. confere (`Conferir`) que os arquivos abrem seguindo o redirect e que a
   release tem cada arquivo dos manifestos.

Os apps (todas as versões), o `install.sh` e a página de download continuam
lendo `<servidor>/updates/latest*.yml`; os arquivos pesados chegam pelo `302`
do Caddy para `github.com/hugoemannuel/concord/releases/download/v<versão>/`.
A assinatura Ed25519 (`.sig`) é conferida como sempre. Downloads de assets de
repo público não contam no limite da API do GitHub.

**Transição (uma vez):** depois do primeiro deploy com este fluxo (a versão no
ar já tem release no GitHub), aplique o Caddyfile com ninguém em chamada:

```bash
gh release view v$(curl -fsS https://74-0-5-252.sslip.io/updates/latest.yml | awk '/^version:/ {print $2}') -R hugoemannuel/concord
scripts/apply-caddyfile.sh --also https://app-salinha.bhrx.com.br root@IP deploy/Caddyfile
```

Antes disso tudo segue saindo do disco. O script volta o backup se o
instalador da versão atual não abrir pelo redirect.

**Rollback (GitHub fora do ar, repo privado ou release com problema):** tire do
`deploy/Caddyfile` as duas linhas do `@release` (o `path_regexp` e o `redir`)
e aplique com o `apply-caddyfile.sh`. A VPS volta a servir os arquivos do
disco na hora, sem build novo nem mudança nos apps. Para publicar versões
nesse meio-tempo sem o GitHub, comente o passo `GitHub Release` do workflow.
Uma versão ruim já publicada se corrige como antes: com uma versão mais nova
(o app não volta de versão). Release no GitHub com problema e versão ainda não
anunciada na VPS: `gh release delete v<versão> --cleanup-tag`.

**Repo mudou de dono ou de nome:** troque o endereço no `redir` do Caddyfile;
o GitHub redireciona nomes antigos por um tempo.

### Porta do backend com o systemd

Sem o socket, o backend fecha a porta ao reiniciar e o Caddy repete a conexão
até o processo novo abrir. Repetir funciona para GET, mas o Caddy não consegue
repetir um POST cujo corpo já leu (testado no 2.6.2 e no 2.10.2): uma mensagem
mandada no meio do deploy dava 502. Com o
[`deploy/concord-server.socket`](../deploy/concord-server.socket), o systemd
segura a porta `127.0.0.1:8090` e a passa ao backend a cada subida
(`LISTEN_FDS`): a porta nunca fecha, as conexões esperam na fila do kernel e o
processo novo atende quando fica pronto. O backend ignora `HOST`/`PORT` do
`.env` quando recebe o socket, então o `ListenStream` tem que ser o endereço
que o Caddy usa. Sem o socket (PC de casa, `go run`), ele escuta sozinho como
antes.

Ativar numa VPS que já roda (uma vez, depois de um deploy desta versão, com
ninguém em chamada: a porta fica fechada por ~1 s). O deploy não envia
`deploy/`, então primeiro, **do PC**, na pasta do repositório:

```bash
scp deploy/concord-server.socket deploy/concord-server.service.d/zero-downtime.conf root@IP:/opt/concord/
```

Depois, **na VPS**, cole o bloco inteiro. Ele para no primeiro erro (se algo
falhar depois de parar o serviço, sobe o serviço de novo) e só imprime
`socket ativo` no fim se tudo passou:

```bash
bash -euo pipefail <<'EOS'
trap 'echo "ERRO na linha $LINENO: parei aqui; subindo o serviço de novo" >&2; systemctl start concord-server || true' ERR
cd /opt/concord
# Os arquivos que o scp mandou:
test -f concord-server.socket
test -f zero-downtime.conf
# O binário no ar e o .good sabem usar o socket (deploy desta versão):
grep -aq concord-capability:socket-activation-v1 concord-server
grep -aq concord-capability:socket-activation-v1 concord-server.good
# O .prev ainda é o binário de antes desta versão, que não sobe com o socket:
cp -f concord-server.good concord-server.prev
mkdir -p /etc/systemd/system/concord-server.service.d
install -m 644 concord-server.socket /etc/systemd/system/
install -m 644 zero-downtime.conf /etc/systemd/system/concord-server.service.d/
systemctl daemon-reload
systemctl stop concord-server
systemctl enable --now concord-server.socket
systemctl start concord-server
for _ in $(seq 30); do curl -fs -m 1 -o /dev/null http://127.0.0.1:8090/healthz && break; sleep 1; done
curl -fsS -m 2 http://127.0.0.1:8090/healthz; echo                                  # {"status":"ok"}
journalctl -u concord-server --since -2min --no-pager | grep "socket do systemd"    # "servidor pronto em … (socket do systemd)"
echo "socket ativo"
EOS
```

O backend precisa ser desta versão ou mais nova: um binário antigo não sabe
usar o socket e não sobe (porta ocupada). Por isso o socket entra **depois** de
um deploy desta versão, e o `cp` acima troca o `.prev`, que até o próximo
deploy ainda seria o binário antigo. Com o socket ativo, o deploy recusa (sem
trocar nada) um binário que não sabe usá-lo e não volta para um assim; veja
[Voltar a uma versão antiga](#voltar-a-uma-versão-antiga).

**Manutenção com o socket:**

- **Parar o backend de vez:** `systemctl stop concord-server.socket
  concord-server`. Parar só o serviço não basta: a próxima conexão (o Caddy, um
  app) o sobe de novo. Para voltar: `systemctl start concord-server.socket
  concord-server`.
- **Não reinicie só o socket** com o serviço no ar: o processo ainda segura a
  porta e o socket não consegue reabri-la. Para mudar o
  `concord-server.socket`: pare os dois, `systemctl daemon-reload` e suba os
  dois (com ninguém em chamada).
- **Porta:** com o socket, o backend ignora `HOST`/`PORT` do `.env`; vale o
  `ListenStream`. O deploy e o `apply-caddyfile.sh` leem a porta do socket
  quando ele está ativo.

### Reinício do backend sem queda

O deploy reinicia o backend (`systemctl restart concord-server`). Com o
SIGTERM, o backend:

1. para de aceitar conexões (com o socket, as novas esperam na fila do kernel);
2. fecha o WebSocket do chat de cada app com o código **1012** ("servidor
   reiniciando"), sem tirar ninguém da chamada nem marcar ninguém offline. O
   1012 sai na hora; espera no máximo 500 ms o "ok" de cada app (um notebook que
   dormiu nunca responde);
3. corta na hora os downloads longos (atualização pelo backend, vídeo/áudio do
   chat em `/api/media`), que o app retoma com Range;
4. dá até 3 s para as requisições comuns em andamento (API, uploads) e fecha à
   força o que sobrar. Um upload grande que esteja no meio nessa hora falha e o
   app mostra o erro.

O processo novo só sobe depois que o antigo sai, então essa espera é o tempo
sem backend: no E2E, ~0,55 s com um download travado e um WebSocket morto
(antes: 10 s). O processo novo espera o banco por até 30 s, recarrega as
chamadas do banco, com o mudo/ensurdecido, o silenciar/ensurdecer de
moderador e quem está transmitindo de cada participante (ficam salvos em
`call_participants`), e só então atende: os ícones de mudo e o selo LIVE não
piscam, e um deploy não libera quem um moderador silenciou. Se não conseguir
ler as chamadas, não fica pronto (nada é encerrado por causa de um erro de
leitura): tenta de novo por até 30 s e então sai com erro.

O app, ao receber o 1012, reconecta em 100–300 ms e não mostra aviso;
"Reconectando ao servidor…" só aparece se a conexão ficar fora por mais de
3 s. Ao reconectar, recupera o que se perdeu na queda, sem som, notificação nem
reconexão da mídia: mensagens novas das salas que estavam carregadas (sem
duplicar; só o que é mais novo que a última mensagem conhecida conta como não
lido), presença, conversas, servidores e canais, amigos (3 s depois, quando os
outros apps também voltaram), a lista dos canais de voz e o estado da chamada
(canal ou DM). Reenvia o próprio mudo/ensurdecido e se está transmitindo. Um
404 ao ler a chamada só fecha a DM ou troca a sala do canal se repetir por
~4 s e não houver mais ninguém na sala de mídia.

`GET /healthz` responde `200` só com o servidor pronto (banco respondendo e
chamadas recarregadas) e `503` enquanto desliga. Não aparece no log. É público
de propósito (o `apply-caddyfile.sh` confere pelo endereço de fora) e
inofensivo: só diz `ok`/`starting`/`stopping`/`database unavailable`, e o banco
é consultado no máximo uma vez por segundo, por mais que batam nele.

**O deploy** (`scripts/deploy-vps.sh`), depois de enviar os arquivos:

1. com o socket ativo, recusa um binário que não sabe usá-lo (uma versão de
   antes desta), sem trocar nada;
2. aplica as migrations com o binário novo (`concord-server.new migrate`, até
   120 s, da pasta `migrations.new`) com o antigo ainda no ar; se falharem, para
   sem tocar em nada;
3. guarda o último binário que passou no `/healthz` em `concord-server.prev`,
   troca, roda `systemctl reset-failed` e reinicia;
4. espera o `/healthz` por até 30 s no relógio (com o socket as requisições
   ficam na fila esse tempo todo, então o prazo é total, não por tentativa).
   Passou: o binário vira `concord-server.good`. Não passou: guarda o novo em
   `concord-server.failed`, **volta sozinho para o `.prev`**, reinicia, espera
   até mais 30 s e sai com erro;
5. só com o backend novo no ar publica a página de download, o app web e os
   manifestos (`latest*.yml`): nenhum app baixa uma versão cujo backend falhou.

**systemd** ([`zero-downtime.conf`](../deploy/concord-server.service.d/zero-downtime.conf)):
`KillSignal=SIGTERM`, `TimeoutStopSec=10` (o backend leva ~3,5 s no pior caso),
`RestartSec=1` com `StartLimitIntervalSec=0` (sem isso, cinco falhas em 10 s
fariam o systemd desistir de vez), `After=`/`Wants=docker.service` e
`Wants=`/`After=concord-server.socket` (`Wants` e não `Requires`: sem o arquivo
do socket o serviço ainda sobe, escutando sozinho). No PC de casa,
`scripts/install-services.sh` gera o serviço com o mesmo desligamento e sem
limite de reinícios (sem socket).

### Ordem dos passos na VPS

Para uma VPS que já roda a versão anterior. Cada passo diz quando pode ser
feito.

1. **Deploy desta versão** (qualquer hora; o CI ao chegar na `main` — ele só
   faz deploy da `main` — ou `scripts/deploy-vps.sh root@IP` do PC). A
   produção está na versão 29, então só a migration `000030` (estado de
   voz/tela de quem está na chamada, só de expandir) entra, antes do
   reinício, com o binário antigo no ar. Esse deploy ainda trava a voz
   uma vez, como antes (o Caddy ainda manda `/rtc` pelo backend). O aviso
   `docker-compose.yml/.env mudou: postgres … --infra` é esperado (versão fixa
   do Postgres) e se repete até o passo 5.
2. **Conferir:** `curl -s http://127.0.0.1:8090/healthz` → `{"status":"ok"}`.
3. **Socket e complemento do systemd** (com ninguém em chamada; a porta fecha
   por ~1 s): [Porta do backend com o systemd](#porta-do-backend-com-o-systemd).
   Inclui conferir que o binário no ar sabe usar o socket e
   Começa com um `scp` do PC (o deploy não envia `deploy/`), confere que o
   binário no ar sabe usar o socket e faz
   `cp -f concord-server.good concord-server.prev` (senão o `.prev` continua o
   binário antigo, que não sobe com o socket).
4. **Caddyfile** (com ninguém em chamada; o script confere):
   `scripts/apply-caddyfile.sh --also https://app-salinha.bhrx.com.br root@IP deploy/Caddyfile`.
   Antes, confira que `/opt/concord` e `/opt/concord/updates` são legíveis pelo
   usuário `caddy` (`chmod o+x /opt/concord; chmod -R o+rX /opt/concord/updates`).
5. **Opcional, num horário calmo:** `scripts/deploy-vps.sh --infra root@IP`
   aplica o `postgres:17.11` (recria só o Postgres; as chamadas seguem, o
   backend espera o banco). Antes: `docker exec concord-postgres postgres
   --version` (de qual versão sai), as notas das versões puladas (procure
   "REINDEX") e um `pg_dump` na hora.
6. **Caddy ≥ 2.7** pelo repositório oficial (feito em 2026-11-01: 2.11.7) e
   depois o Caddyfile com `stream_close_delay` (seção do Caddyfile acima).

**Voltar atrás um deploy** (o deploy já faz isso sozinho quando o novo não
sobe). Com o socket ativo, só volte para um binário que sabe usá-lo:

```bash
cd /opt/concord
if ! systemctl is-active -q concord-server.socket || grep -aq concord-capability:socket-activation-v1 concord-server.prev; then
  # -f: o binário no ar está em execução; sem -f o cp falha ("Text file busy")
  # e o restart sobe o mesmo binário de novo.
  cp -f concord-server concord-server.failed && cp -f concord-server.prev concord-server
  systemctl reset-failed concord-server; systemctl restart concord-server
  sleep 2; curl -s http://127.0.0.1:8090/healthz                                # {"status":"ok"}
else
  echo "NÃO: o .prev não sabe usar o socket ativo (veja Voltar a uma versão antiga)"
fi
```

As migrations não voltam (são só de expandir; o binário anterior funciona com
elas). O Caddyfile anterior fica em `/etc/caddy/Caddyfile.bak-<data>`.

### Voltar a uma versão antiga

Uma versão de antes do socket (um revert deste PR, um hotfix de uma branch
antiga) não sobe com o `concord-server.socket` ativo: o deploy recusa e diz
isso, sem trocar nada. O CI só faz deploy da `main`, então um
`workflow_dispatch` numa branch ou tag antiga não chega à VPS. Para instalar
uma assim, primeiro tire o socket (com ninguém em chamada; a porta fecha por
~1 s):

```bash
systemctl stop concord-server.socket concord-server
systemctl disable concord-server.socket
rm /etc/systemd/system/concord-server.socket                                    # o Wants= do complemento ignora um socket que não existe
systemctl daemon-reload
systemctl start concord-server                                                  # o binário atual escuta sozinho na PORT do .env
curl -s http://127.0.0.1:8090/healthz                                           # {"status":"ok"}
```

O `PORT` do `.env` tem que ser `8090` (o endereço do Caddy). **Não use
"Re-run" num Deploy do GitHub Actions de antes desta versão:** ele usa o
`deploy-vps.sh` antigo, que não tem a checagem do socket, e instalaria um
binário que não sobe enquanto o socket estiver ativo. Depois faça o
deploy da versão antiga: ela não traz a volta automática nem a checagem do
socket. Para voltar ao socket, siga
[Porta do backend com o systemd](#porta-do-backend-com-o-systemd) de novo.

### Conferir que o deploy não foi percebido

Durante um deploy, com alguém em chamada:

- no app, **não** aparece "Chamada reconectada.", "Reconectando a chamada…",
  "Reconectando ao servidor…" nem "<nome> saiu da chamada";
- no console do app (Ctrl+Shift+I → Console), **não** aparecem
  `signal disconnected`, `resuming signal connection` nem
  `triggering ICE restart` (é o que travava a voz);
- o selo LIVE e os ícones de mudo na lista do canal de voz não piscam;
- uma mensagem mandada no meio do deploy aparece uma vez para todo mundo, e
  as não lidas das outras salas não pulam;
- na VPS: `journalctl -u concord-server -n 20` mostra `servidor desligado` e,
  logo depois, `servidor pronto em … (socket do systemd)`; a saída do deploy
  termina com `backend no ar (/healthz ok)`.

O teste automático disso é o `scripts/e2e-restart-call.mjs` (Caddy 2.6.2 com
os trechos do `deploy/Caddyfile`, a porta segurada como pelo socket, backend,
LiveKit e dois navegadores; o cabeçalho do script explica como subir).

### Migrations: expandir e contrair

As migrations (`backend/migrations`) rodam **antes** de o binário novo
atender: o deploy roda `concord-server.new migrate` com o binário antigo
ainda no ar e só reinicia se elas passarem (se falharem, o backend no ar não é
tocado). Na subida, o binário confere de novo (sob um *advisory lock*) e só
abre a porta depois. Isso significa que **o binário antigo roda com o schema
novo**: durante o deploy e num rollback
(`mv concord-server.prev concord-server && systemctl restart concord-server`,
que não desfaz migration nenhuma). Por isso:

1. **Só acrescentar** na release que precisa: tabela nova, coluna que aceita
   `NULL` ou tem `DEFAULT`, índice novo. O `INSERT` do código antigo, que não
   conhece a coluna, tem que continuar funcionando.
2. **Nunca apagar nem renomear** na mesma release que para de usar. Release N:
   o código para de ler e escrever a coluna. Release N+1 (ou depois): a
   migration apaga.
3. **Renomear é acrescentar + copiar + apagar**, em releases separadas:
   coluna nova; código grava nas duas e lê da nova (com os dados copiados);
   depois apaga a velha.
4. **Restrições novas** (`NOT NULL`, `CHECK`, `UNIQUE`, tipo mais estreito) só
   depois que nenhum binário no ar grava valores que as violem.
5. **Curtas** (menos de ~100 ms): cada migration roda numa transação e trava a
   tabela. Dados grandes se migram em lotes pelo código, não na migration.
   `CREATE INDEX CONCURRENTLY` não roda dentro da transação do migrador.
6. **Idempotentes** (`IF NOT EXISTS`, `IF EXISTS`): o migrador trata "já
   existe" como aplicada.
7. Escreva o `.down.sql`, mas não conte com ele num rollback: quem volta é o
   binário, e ele tem que aguentar o schema novo (regra 1).
8. Números de migration são únicos e **crescem na ordem em que chegam à
   VPS**: o migrador guarda só a última versão aplicada, então com duas
   branches usando o mesmo número uma nunca roda, e uma migration com número
   menor que a última aplicada (ex.: `000029` mesclada depois de um deploy da
   `000030`) também nunca roda. Renumere ao juntar. Proteções: o backend não
   sobe com dois arquivos de mesmo número e avisa alto no log quando uma
   migration de número menor que a versão do banco nunca rodou; no CI,
   `scripts/check-migrations.mjs` reprova o PR com número repetido ou com
   migration nova que não fique acima da maior da branch de destino.

### Postgres e LiveKit não são recriados no deploy

O LiveKit roda sem Redis: as salas só existem na memória dele, então
**recriar o container do LiveKit derruba todas as chamadas**. Recriar o
Postgres derruba o backend por alguns segundos. Por isso o deploy:

- sobe só o que estiver parado ou faltando (`docker compose up -d --no-recreate`);
- compara a configuração nova de cada serviço (o hash que o Compose usa para
  decidir recriar) com a dos containers rodando. Se algo mudou no
  `docker-compose.yml` ou no `/opt/concord/.env` (imagem, portas, `LIVEKIT_*`,
  `POSTGRES_*`), ele **avisa, mantém o compose antigo e segue só com o
  backend**. No GitHub Actions o aviso aparece como *warning* no resumo do job;
- só recria com `--infra`. Rode quando ninguém estiver em chamada:
  ```bash
  scripts/deploy-vps.sh --infra root@IP
  ```

O `--infra` recria **todo** serviço cuja configuração mudou. Na VPS o Postgres
ainda roda `postgres:17` (o `postgres:17.11` do compose não foi aplicado), então
um `--infra` recria o Postgres junto. Para trocar só o LiveKit (foi assim a
1.13.10 → 1.13.11, em 2026-11-01), com ninguém em chamada, mande o compose novo e
recrie só ele:

```bash
rsync -az backend/docker-compose.yml root@IP:/opt/concord/docker-compose.yml.new
ssh root@IP 'cd /opt/concord && cp -p docker-compose.yml docker-compose.yml.bak-$(date +%Y%m%d-%H%M%S) &&
  mv docker-compose.yml.new docker-compose.yml && docker compose pull livekit &&
  docker compose up -d --no-deps livekit'
```

Volta: o `docker-compose.yml.bak-*` no lugar e o mesmo `up -d --no-deps livekit`.
Confira depois `/rtc/validate` = 401, `curl -s 127.0.0.1:6789/metrics | grep -c
^livekit_` > 0 e, nos logs (`docker logs concord-livekit`), o `nodeIP` igual ao
IP público e uma entrada com `mediaTrack published`.

As imagens têm versão fixa (`postgres:17.11`, `livekit/livekit-server:v1.13.11`).
Trocar a versão é uma mudança de infraestrutura como qualquer outra: entra no
próximo `--infra`. Comentários YAML no compose não contam, mas o texto dentro
do `LIVEKIT_CONFIG` (comentários inclusive) vira variável do container e conta.

**Página de download:** `site/` é uma página estática que lê
`/updates/latest.yml` (Windows) e `/updates/latest-linux.yml` (Linux) e aponta
cada botão para o artefato correspondente. A falha de um manifesto não bloqueia
o download da outra plataforma. O deploy guarda só a versão atual: o instalador, o
`.blockmap` e o `.sig` que os manifests citam; o resto é apagado. No Caddyfile, `salinha.bhrx.com.br` serve a
página e o `/updates/` direto do disco; `concord.bhrx.com.br` redireciona para
ele. Os dois estão atrás do proxy do Cloudflare (nuvem laranja).

**App no navegador:** a mesma Salinha, sem instalar, em
`https://app-salinha.bhrx.com.br`. Usa as mesmas contas e o mesmo backend; o
navegador fala com o backend na mesma origem (API em `/api`, chat em `/ws`,
chamadas em `/rtc`, tudo por HTTPS/WSS). O `yarn build:web` (em `frontend/`)
gera `frontend/dist-web/` e o `scripts/deploy-vps.sh` envia para
`/opt/concord/web/` (o `--delete` só mexe nessa pasta; uploads e atualizações
ficam como estão).

> **Antes de mesclar a `develop` na `main`:** o DNS, o bloco do Caddy (passos 1
> e 2) e a variável `WEB_URL` do GitHub Actions (seção "Deploy automático")
> precisam estar prontos. O merge publica sozinho a página de download, que tem
> o botão "Usar no navegador" apontando para `https://app-salinha.bhrx.com.br`;
> sem o domínio no ar, o botão leva a um erro. Confira com
> `curl -sI https://app-salinha.bhrx.com.br/` antes do merge.

1. **DNS:** no Cloudflare, registro `A` `app-salinha` → IP da VPS. Hoje está
   com o proxy ligado (nuvem laranja) e funciona, inclusive WebSocket e `/rtc`;
   o limite de upload do Cloudflare (100 MB no plano grátis) fica acima dos
   25 MB do chat. Confira com `dig +short app-salinha.bhrx.com.br`.
2. **Caddy:** o bloco `app-salinha.bhrx.com.br` está no
   [`deploy/Caddyfile`](../deploy/Caddyfile): `/rtc*` direto no LiveKit,
   `/api`, `/api/*` e `/ws` no backend, `/assets/*` com cache longo e o resto
   devolve o `index.html`. Aplique com `scripts/apply-caddyfile.sh` (seção
   "Caddyfile" acima). O `/updates/` não entra: só o app desktop se atualiza
   por ele.
3. **Publicar:** `cd frontend && yarn build:web`, depois
   `scripts/deploy-vps.sh root@IP` (o deploy automático já faz os dois).
4. **Conferir:** `curl -sI https://app-salinha.bhrx.com.br/friends` responde
   `200` com o index.html, e `curl -s -o /dev/null -w '%{http_code}'
   https://app-salinha.bhrx.com.br/api/users/me` responde `401`.

As chamadas no navegador usam as mesmas portas de mídia do LiveKit (UDP 7882 e
TCP 7881) que o app desktop. No navegador não há bandeja, iniciar com o
sistema, overlay de jogo nem atualização automática (a página nova chega ao
recarregar); o seletor de tela é o do navegador, e o som da tela depende dele
(no Chrome/Edge, marque "Compartilhar áudio"; o Firefox compartilha sem som).
As notificações precisam ser liberadas em **Configurações → Notificações →
Permitir notificações**.

**Migrar sem perder nada e sem mandar `.exe` novo:**
1. Pare o backend antigo.
2. Copie o banco: `pg_dump` no antigo → `psql` na VPS, e confira as contagens.
3. No PC antigo, repasse a porta do backend para a VPS:
   `docker run -d --restart unless-stopped --name concord-relay --network host alpine/socat TCP-LISTEN:<PORT>,fork,reuseaddr TCP:<IP-da-VPS>:8080`.
   Na VPS, um bloco `:8080 { reverse_proxy 127.0.0.1:8090 }` no Caddy recebe
   esse tráfego. Assim o endereço antigo (playit) continua funcionando.
   Enquanto o repasse existir, todo mundo que chega por ele aparece com o IP
   do PC antigo e divide o limite de 30 tentativas de login a cada 5 minutos
   por IP.
4. Publique uma versão nova com o `PUBLIC_URL` da VPS. Os apps antigos se
   atualizam pelo endereço antigo e passam a falar direto com a VPS.
5. Quando todos estiverem na versão nova, desligue o repasse, o playit e o
   bloco `:8080` (feito em 2026-10-31; veja "Portas abertas na VPS").

**Deploy automático (GitHub Actions):** o workflow `.github/workflows/deploy.yml`
roda a cada push/merge na `main`:
1. Roda os testes do backend, do app e do helper. Se algum falhar, para aqui.
2. Gera o instalador assinado com a próxima versão (uma acima da que já está
   publicada na VPS).
3. Gera o app web (`yarn build:web`) e publica o backend, a página de
   download, o app web e a atualização com `scripts/deploy-vps.sh`.
4. Confere que tudo subiu.

Para ligar, em **Settings → Secrets and variables → Actions**:
- **Secrets:**
  - `VPS_SSH_KEY`: uma chave SSH só para o deploy, autorizada na VPS;
  - `VPS_KNOWN_HOSTS`: saída de `ssh-keyscan <ip>`;
  - `RELEASE_KEY`: conteúdo do `backend/.release-key`;
  - `TECH_TEAM_USER_IDS` (opcional): ids de usuário, separados por vírgula e
    sem espaços, de quem move os cards das propostas. O deploy grava (ou troca)
    essa linha em `/opt/concord/.env` antes de reiniciar o backend. Vazio ou
    ausente, o `.env` da VPS fica como está. O `.env` da VPS continua sendo
    intocado para o resto;
  - `CHANGELOG_TOKEN` (opcional): segredo com que o deploy publica as notas da
    versão em `PUT /api/changelog/<versão>` (gere com `openssl rand -hex 24`;
    só letras e números). O deploy grava a mesma linha no `.env` da VPS e o
    passo "Changelog" usa o secret. Sem ele a publicação fica desligada (o
    servidor responde 503) e a leitura do changelog segue funcionando.
- **Variables:**
  - `DEPLOY_ENABLED=true`;
  - `VPS_HOST=root@<ip>`;
  - `PUBLIC_URL=https://<endereço>`;
  - `SITE_URL=https://<página de download>` (opcional; padrão `https://salinha.bhrx.com.br`);
  - `WEB_URL=https://app-salinha.bhrx.com.br` (opcional): confere o app web
    depois do deploy. Ligue só depois do DNS e do bloco do Caddy prontos.
  - `SERVER_FALLBACK_URLS` (opcional; padrão o `WEB_URL` ou
    `https://app-salinha.bhrx.com.br`): endereços alternativos do mesmo
    servidor embutidos no app desktop. Ao abrir, o app testa o `PUBLIC_URL` e
    os alternativos (`/healthz`) e usa o primeiro que responde; o resultado vai
    para `%APPDATA%\Concord\logs\conexao.log` e para o "Detalhes" do aviso
    de conexão. Existe porque o `*.sslip.io` não resolve (ou é bloqueado por
    antivírus/filtro de DNS) na rede de alguns usuários. O alternativo precisa
    servir `/api`, `/ws`, `/rtc*` e `/updates/*` (bloco `app-salinha` do
    [`deploy/Caddyfile`](../deploy/Caddyfile)).

Sem `DEPLOY_ENABLED`, o workflow só roda os testes.

**Backup:** um timer do systemd roda `pg_dump` todo dia e guarda 14 dias em
`/opt/concord/backups`. O backup diário é só do banco; a mídia do chat fica em
`/opt/concord/uploads` e não entra nele. Arquivos que a limpeza horária acha
sem mensagem vão para `/opt/concord/uploads/.trash` e só são apagados depois de
7 dias; com o banco sem nenhum anexo (banco novo ou restore pendente) a limpeza
não mexe nos arquivos. Restaure o banco antes de 7 dias para não perder mídia.

**Restaurar o banco de um backup:**
1. Pare o backend: `systemctl stop concord-server`.
2. Restaure o dump com `psql` no banco do Postgres.
3. Devolva a mídia que a limpeza tenha mandado para a lixeira enquanto o banco
   estava errado: `mv /opt/concord/uploads/.trash/* /opt/concord/uploads/`.
   É seguro: o que for órfão de verdade volta para a lixeira na próxima limpeza.
4. Suba o backend: `systemctl start concord-server`.

### Métricas do LiveKit (observabilidade das lives)

O LIVEKIT_CONFIG liga o Prometheus do LiveKit (`prometheus.port`, padrão
`6789`, `LIVEKIT_PROMETHEUS_PORT` no `.env`). Ele escuta só nos
`bind_addresses` (127.0.0.1): nada abre para fora e o firewall não muda. O
backend lê esse `/metrics` e o `/proc` da VPS a cada minuto e grava uma linha
em `livekit_metrics` (banda, perda, NACK/PLI, RTT, jitter, nota de
qualidade, salas, participantes, tracks, CPU e memória do LiveKit e da
máquina), com 14 dias de retenção. Painel e consultas:
[OBSERVABILIDADE.md](OBSERVABILIDADE.md) ([ADR 0029](adr/0029-observabilidade-das-lives.md)).

**Aplicar na VPS (uma vez):** a linha nova do `LIVEKIT_CONFIG` muda o hash do
container, então o deploy normal **avisa e não recria** o LiveKit. Quando
ninguém estiver em chamada (recriar derruba todas as calls e lives):

```bash
scripts/deploy-vps.sh --infra root@IP
# conferir:
ssh root@IP 'curl -s 127.0.0.1:6789/metrics | grep -c ^livekit_'   # > 0
ssh root@IP 'ss -ltn | grep 6789'                                  # só 127.0.0.1
```

Até o `--infra`, o backend grava as linhas só com a CPU/memória da VPS
(`up = false`). Se a 6789 já estiver em uso na VPS, ponha outra em
`LIVEKIT_PROMETHEUS_PORT` no `/opt/concord/.env` (o backend e o compose leem
a mesma variável).

## Nomes de usuário sem diferenciar caixa

O login aceita e-mail ou nome de usuário sem diferenciar maiúsculas de
minúsculas, e o cadastro recusa (409) um nome ou e-mail que já exista com
outra caixa. A migration 000025 cria um índice **único** em `lower(username)`
quando o banco não tem usernames que só diferem na caixa; se tiver, cria um
índice comum e não falha. Nesse caso o backend avisa no boot com uma linha
`WARNING: N grupo(s) de usernames ...` (só contagens, sem nomes).

**Antes do deploy**, rode no Postgres de produção:
```sql
SELECT lower(username), count(*) FROM users GROUP BY 1 HAVING count(*) > 1;
SELECT lower(email), count(*) FROM users GROUP BY 1 HAVING count(*) > 1;
```
Sem linhas na primeira query, a migration cria o índice único. Com linhas,
combine com os donos qual conta muda de nome (`UPDATE users SET username = ...
WHERE id = ...`) e depois crie o índice à mão:
```sql
CREATE UNIQUE INDEX users_username_lower_key ON users (lower(username));
DROP INDEX IF EXISTS idx_users_username_lower;
```
Enquanto isso, essas contas só entram digitando o nome com a caixa exata (ou
pelo e-mail).

Se o boot logar `ERROR: faltam os índices do login ...`, a 000025 foi pulada
(o runner guarda só a maior versão aplicada, então uma migration de número
maior aplicada antes dela faz a 000025 nunca rodar). Ela é idempotente: rode
`psql "$DATABASE_URL" -f /opt/concord/migrations/000025_add_login_lower_indexes.up.sql`
e reinicie o backend.

## Badge Fundador (devs)

O badge mítico **Fundador** é só dos devs. Quem ganha fica na
tabela `dev_badge_users` (migration 000057), que começa vazia: não há id de
usuário no código. O badge aparece no próximo carregamento dos badges da
pessoa (abrir o perfil ou até 5 minutos online), com o aviso de badge novo.

Conceder (troque os nomes; a comparação ignora maiúsculas e rodar de novo não
duplica):
```sql
INSERT INTO dev_badge_users (user_id)
SELECT id FROM users WHERE lower(username) IN ('fulano', 'ciclano')
ON CONFLICT DO NOTHING;
```

Conferir quem tem:
```sql
SELECT u.username, d.granted_at FROM dev_badge_users d JOIN users u ON u.id = d.user_id;
```

Tirar (o badge some na hora, mesmo já gravado; a segunda linha apaga também a
data de quando foi ganho, para começar do zero se voltar):
```sql
DELETE FROM dev_badge_users WHERE user_id IN (SELECT id FROM users WHERE lower(username) IN ('fulano'));
DELETE FROM user_badges WHERE category = 'criador' AND user_id IN (SELECT id FROM users WHERE lower(username) IN ('fulano'));
```

Na VPS: `psql "$DATABASE_URL" -c "..."` com o SQL acima.

## Badge Top 10 do Nível 100

O badge mítico **Top 10 do Nível 100** é automático: os 10 primeiros a chegar
no nível 100 ganham, na ordem de chegada, gravada em `badge_top10`
(migration 000069). A vaga é dada quando os badges da pessoa são avaliados
(a cada minuto em call, ao abrir o perfil ou a cada 5 minutos online), com
uma trava por transação: dois chegando juntos entram um depois do outro, e a
tabela não aceita mais de 10. Quem já estava no nível 100 no deploy entrou
pela data do tier Imortal do badge Nível (empate: mais XP, depois conta mais
antiga). Conta apagada não devolve a vaga.

Conferir a fila:
```sql
SELECT t.posicao, u.username, t.reached_at FROM badge_top10 t LEFT JOIN users u ON u.id = t.user_id ORDER BY t.posicao;
```

## Badge Caçador de bugs

O badge **Caçador de bugs** é concedido à mão pelo time, na tabela
`bug_hunters` (migration 000068), que guarda quantos bugs cada pessoa
reportou. Os tiers vão por quantidade: Olho Vivo (1), Detetive (3),
Exterminador (10) e Lenda do QA (25). Sem linha (ou com 0 bugs) o badge nem
aparece. Ele chega no próximo carregamento dos badges da pessoa (abrir o
perfil ou até 5 minutos online), com o aviso de badge novo.

Conceder ou somar bugs (troque o nome e a quantidade; a comparação ignora
maiúsculas; quem ainda não tinha entra com essa quantidade, quem já tinha
soma):
```sql
INSERT INTO bug_hunters (user_id, bugs)
SELECT id, 1 FROM users WHERE lower(username) = lower('fulano')
ON CONFLICT (user_id) DO UPDATE SET bugs = bug_hunters.bugs + EXCLUDED.bugs, updated_at = NOW();
```

Conferir quem tem:
```sql
SELECT u.username, h.bugs, h.updated_at FROM bug_hunters h JOIN users u ON u.id = h.user_id ORDER BY h.bugs DESC;
```

Corrigir para um número exato (tier já conquistado não se perde):
```sql
UPDATE bug_hunters SET bugs = 5, updated_at = NOW() WHERE user_id = (SELECT id FROM users WHERE lower(username) = lower('fulano'));
```

Tirar (o badge some na hora; a segunda linha apaga também as datas dos tiers):
```sql
DELETE FROM bug_hunters WHERE user_id IN (SELECT id FROM users WHERE lower(username) IN ('fulano'));
DELETE FROM user_badges WHERE category = 'bugs' AND user_id IN (SELECT id FROM users WHERE lower(username) IN ('fulano'));
```

Na VPS: `psql "$DATABASE_URL" -c "..."` com o SQL acima.

## Bot de música (Maestro)

O Maestro toca música do YouTube nas chamadas de voz (`/play`, `/skip`...). Ele
precisa de dois programas no PATH do servidor; sem eles o backend sobe normalmente
e o Maestro responde "fora do ar".

- **ffmpeg**: `sudo apt-get install -y ffmpeg`.
- **yt-dlp**: use o **binário oficial** (o do `apt` fica velho e o `yt-dlp -U`
  não funciona nele). O `scripts/install-services.sh` baixa o binário para
  `~/.local/bin/yt-dlp` se não achar um no PATH, e instala o timer
  `concord-ytdlp-update.timer`, que roda `yt-dlp -U` todo dia (o YouTube muda
  com frequência e quebra versões antigas). O script também recusa seguir sem
  `ffmpeg`.

**Na VPS**, o `scripts/deploy-vps.sh` já cuida disso a cada deploy, antes de
reiniciar o `concord-server`: instala o `ffmpeg` (apt) se faltar, baixa o binário
oficial do yt-dlp para `/usr/local/bin/yt-dlp` se faltar (com `python3`) e
instala o timer de sistema `concord-ytdlp-update.timer`, que roda `yt-dlp -U` todo
dia. Sem ffmpeg o deploy falha; o timer, se der erro, só avisa. Para fazer na mão
(como root):

```bash
apt-get update && apt-get install -y ffmpeg python3
curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod a+rx /usr/local/bin/yt-dlp
cat >/etc/systemd/system/concord-ytdlp-update.service <<'EOF'
[Service]
Type=oneshot
ExecStart=/usr/local/bin/yt-dlp -U
EOF
cat >/etc/systemd/system/concord-ytdlp-update.timer <<'EOF'
[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload && systemctl enable --now concord-ytdlp-update.timer
systemctl restart concord-server
```

O backend só procura `ffmpeg` e `yt-dlp` ao subir: depois de instalar na mão,
**reinicie o `concord-server`** (último comando acima) para o Maestro sair do
"fora do ar".

### Variáveis (`backend/.env`)

Todas opcionais; os padrões e comentários estão no `backend/.env.example`.

| Variável | Para quê |
|---|---|
| `MUSIC_MAX_PLAYERS=5` | canais de voz tocando ao mesmo tempo |
| `MUSIC_QUEUE_MAX=100` | músicas por fila |
| `MUSIC_IDLE_TIMEOUT=5m` | sem música por esse tempo, o Maestro sai da call |
| `MUSIC_CACHE_DIR` | cache das faixas (padrão: pasta temporária do sistema/concord-music) |
| `MUSIC_YT_COOKIES` | caminho do `cookies.txt` de uma conta Premium (veja abaixo) |
| `MUSIC_POT_URL` | provedor de PO token, ex.: `http://127.0.0.1:4416` (veja abaixo) |
| `MUSIC_TEST_SOURCE=1` | só para testes/e2e: tons do ffmpeg no lugar do YouTube |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | app do Spotify for Developers: o "Ouvir no Spotify" da atividade abre a faixa em vez da busca ([ADR 0033](adr/0033-links-diretos-do-ouvir-tambem.md)) |

### Cookies do YouTube Premium (opcional, 256 kbps)

Com uma conta Premium o yt-dlp pega o formato 774 (~256 kbps) em vez de ~160 kbps.

1. Numa **janela anônima**, entre na conta Premium no YouTube.
2. Exporte o `cookies.txt` com a extensão "Get cookies.txt LOCALLY" e feche a janela.
3. Salve o arquivo **fora do repositório** (ex.: `/opt/concord/cookies.txt`, só você lê).
4. Aponte `MUSIC_YT_COOKIES=/opt/concord/cookies.txt` no `.env` e reinicie o backend.

Os cookies expiram: renove quando o Maestro voltar a ~160 kbps ou falhar com
"Sign in".

### PO token (quando o YouTube bloquear o IP)

Se o YouTube marcar o IP do servidor como bot, o yt-dlp precisa de um PO token:

1. Suba o provedor: `docker compose --profile music up -d` (em `backend/`). Ele
   escuta só em `127.0.0.1:4416`.
2. Instale o plugin do yt-dlp na máquina: `pip install --user bgutil-ytdlp-pot-provider`
   (ou baixe o zip do plugin para `~/.config/yt-dlp/plugins/`).
3. Defina `MUSIC_POT_URL=http://127.0.0.1:4416` no `.env` e reinicie o backend.

### Uso de recursos

- ~1 encoder `ffmpeg` por canal tocando, além dos downloads das faixas.
- ~320 kbps de upload por pessoa ouvindo, mais o vídeo só para quem abrir.

O teste de ponta a ponta fica em `scripts/e2e-music.mjs` (backend com
`MUSIC_TEST_SOURCE=1 MUSIC_IDLE_TIMEOUT=5s`).

## Segurança

Com o playit, login e mensagens trafegam **sem criptografia** (HTTP). Na VPS
com Caddy, tudo vai por HTTPS/WSS. A mídia das chamadas vai criptografada
no trajeto (DTLS-SRTP do WebRTC) até o LiveKit, que a descriptografa para
repassar: não é criptografia de ponta a ponta (o servidor poderia acessar a
mídia). O que guardamos e por quanto tempo está em `site/privacidade.html`. Numa VPS sem firewall, o `docker-compose.yml` já deixa
o Postgres e a API do LiveKit só em `127.0.0.1`.

# Roteiro: montar o servidor próprio da Salinha para uma pessoa leiga

**Este arquivo é para você, IA** (Claude, ChatGPT/Codex, Gemini...). Uma pessoa
sem nenhum conhecimento de tecnologia mandou o link deste repositório e disse
algo como "quero ter meu próprio servidor". Você conduz tudo, do zero até os
amigos dela conversando e entrando em chamada, **fazendo você mesma o máximo
possível**. Ela só faz o que só ela pode fazer: pagar, criar contas, clicar em
painéis de sites e testar no próprio computador ou celular.

Fontes de verdade: [docs/HOSPEDAGEM.md](../HOSPEDAGEM.md) (como o servidor
oficial roda), os scripts em `scripts/` e os modelos em `deploy/`. Este roteiro
só junta o caminho mais simples que funciona (decisões no
[ADR 0042](../adr/0042-servidor-proprio-guiado-por-ia.md)). Se algo aqui
divergir do código, **o código vale**. Não invente comando, variável nem caminho.

## 1. Como falar com a pessoa

- **Português simples, frases curtas.** Sem jargão. Se a palavra técnica for
  inevitável, explique numa frase, uma vez:
  - *VPS*: "um computador alugado na internet, que fica ligado 24 horas".
  - *Domínio*: "o nome do endereço, tipo `meugrupo.com.br`".
  - *DNS*: "a lista que diz para a internet qual computador responde por um nome".
  - *SSH*: "o jeito de eu entrar no servidor para configurar, pela internet".
  - *Root*: "o usuário administrador do servidor".
- **Uma pergunta por vez.** Espere a resposta antes da próxima.
- **Antes de cada passo, diga o que vai acontecer e quanto tempo leva**
  ("agora vou instalar os programas no servidor; leva uns 10 minutos, você não
  precisa fazer nada").
- **Peça confirmação antes de tudo que custa dinheiro ou é difícil de
  desfazer**: assinar VPS ou domínio, apagar dados, desligar login por senha,
  ligar o firewall.
- **Nunca mostre segredos na conversa** (senhas geradas, chaves, o conteúdo do
  `.env`). Os scripts deste roteiro geram e gravam sem imprimir. Se a pessoa
  colar uma senha no chat, use e, no fim, peça para ela trocar (seção 4.11).
- **Comemore os marcos** ("o servidor está no ar!") e, quando algo falhar,
  diga o que deu errado em uma frase e o que você vai tentar.
- Não despeje o roteiro inteiro. Mostre só o próximo passo.

## 2. Antes de começar: o que você consegue fazer?

Descubra em silêncio (sem perguntar à pessoa) se você executa comandos:

| Situação | Como seguir |
|---|---|
| Você tem terminal (Claude Code, Codex CLI, Gemini CLI, agente com shell) e `ssh` | Faça tudo você mesma pelo `ssh`. Este é o caminho principal. |
| Você só conversa (chat no navegador, sem executar nada) | Explique que dá para seguir assim, mas a pessoa vai colar comandos. Ofereça antes: instalar um agente com terminal (ex.: Claude Code) e voltar a falar com você por lá. Se ela preferir colar: use o **console web do provedor** da VPS (botão "Console", "Terminal" ou "VNC" no painel), um bloco por vez, e peça que ela cole a resposta de volta. |

Todos os comandos da VPS abaixo rodam **na própria VPS** (o código é baixado e
compilado lá). Assim não importa se a sua máquina é Windows, macOS ou Linux:
basta o `ssh` (ou o console web do provedor).

Nos blocos abaixo, `IP` é o IP da VPS e `ENDERECO` é o endereço do servidor
sem `https://` (ex.: `203-0-113-7.sslip.io`). Troque antes de rodar.

## 3. A conversa: árvore de decisão

### 3.1 Abertura

Explique em 3 ou 4 frases:

> Vamos montar a sua própria Salinha: um lugar só seu e dos seus amigos para
> conversar, fazer chamadas de voz e vídeo e compartilhar a tela. Ela precisa
> de um computador ligado o tempo todo na internet. O jeito mais fácil e
> estável é alugar um (custa a partir de uns R$ 40 por mês). Eu faço quase
> tudo; vou te pedir algumas coisas no caminho. No total leva de 1 a 2 horas.

### 3.2 Ela já tem um servidor?

Pergunte de um jeito que um leigo entende:

> Você já paga por um servidor ou computador na nuvem, de empresas como
> Hostinger, Contabo, DigitalOcean, Magalu Cloud, Locaweb ou parecidas?

- **Sim** → confira se serve (seção 3.3) e vá para a seção 4.
- **Não** → explique as duas opções e recomende a primeira:
  1. **Alugar uma VPS (recomendado).** Estável, rápida, com endereço seguro
     (HTTPS) e funciona no navegador e no celular sem instalar nada. Seção 3.3.
  2. **Usar o próprio computador.** Só se ela não quiser pagar a VPS. Diga
     com clareza: o computador precisa ficar **ligado e conectado 24 horas**
     (de preferência no cabo), as chamadas dependem da internet de casa, o
     túnel do playit.gg que leva os amigos até ele custa uns US$ 3 por mês
     (para voz e vídeo) e, sem HTTPS, os amigos precisam instalar o app (não
     dá para usar pelo navegador). Seção 5.

### 3.3 Escolher e assinar a VPS

O que a Salinha precisa (de [HOSPEDAGEM.md, seção 7](../HOSPEDAGEM.md#7-rodar-numa-vps-recomendado)):

| Item | Mínimo | Por quê |
|---|---|---|
| Processador | **2 vCPU, x86/AMD64** (não ARM) | o `deploy-vps.sh` compila para `amd64` |
| Memória | **2 a 4 GB de RAM** (4 GB é mais folgado) | banco, servidor de chamadas e a compilação |
| Disco | 40 GB ou mais | sistema, programas, fotos e vídeos do chat |
| Tráfego | **2 a 3 TB por mês** se usarem compartilhamento de tela; ilimitado é melhor | toda a voz, vídeo e tela passam pelo servidor |
| Sistema | **Debian 13** ou **Ubuntu 24.04** | os comandos deste roteiro foram feitos para eles |
| Local | Brasil (São Paulo), perto do grupo | menos atraso na voz |
| Rede | IP público próprio e portas UDP liberadas | as chamadas usam UDP |

Faixa de preço realista (nov/2026): **R$ 40 a R$ 100 por mês** para 2 vCPU e
4 a 8 GB. Os preços mais baixos costumam valer só em contratos longos (12 a 48
meses). Diga isso à pessoa e não indique uma empresa como "a melhor".

Conduza:

1. "Procure no Google por **VPS Brasil** e escolha um plano com pelo menos 2
   vCPU e 4 GB de RAM. Me mande o link do plano antes de pagar, que eu confiro."
   Confira processador x86, RAM, tráfego e se o sistema Debian 13 ou Ubuntu 24.04
   está disponível.
2. **Confirme antes de ela pagar** ("o plano X custa R$ Y por mês; posso
   considerar que você vai assinar?").
3. Na criação: sistema **Debian 13** (ou Ubuntu 24.04), local mais próximo,
   e uma **senha forte para o root** (o painel pede). Se o painel tiver campo
   de "chave SSH", ignore por enquanto: você instala a chave depois.
4. No fim, peça para ela anotar e te mandar: o **IP** (quatro números
   separados por pontos, ex.: `203.0.113.7`) e a **senha do root**.

### 3.4 Domínio (nome do endereço)

Pergunte:

> Você já tem um domínio, um nome de site tipo `meugrupo.com.br`?

- **Não tem (o normal)** → **comece sem**. O servidor ganha um endereço
  automático e seguro a partir do IP: `203-0-113-7.sslip.io` (os pontos do IP
  viram hífens). É o mesmo esquema que a Salinha oficial usa. Funciona com
  HTTPS e sem custo. Diga que dá para trocar por um nome bonito depois
  (seção 7.6).
- **Tem** → pergunte em qual empresa (Registro.br, Cloudflare, Hostinger,
  GoDaddy...) e conduza a criação do registro DNS antes da seção 4.4:
  - Tipo **A**, nome (ou "host") **`salinha`** (vira `salinha.dominio.com.br`;
    use `@` se quiser o domínio puro), valor (ou "aponta para") **o IP da
    VPS**, TTL o padrão.
  - **Cloudflare**: deixe a nuvem **cinza** ("Somente DNS"), não laranja. O
    Caddy precisa ver o IP real de quem conecta (limites de tentativas de
    login) e tirar o certificado sozinho.
  - **Registro.br**: em "DNS" do domínio, "Configurar zona DNS" (se ainda usa o
    DNS do Registro.br), "Nova entrada", tipo A.
  - Confira você mesma: `getent hosts salinha.dominio.com.br` (ou `nslookup`)
    tem que devolver o IP da VPS. Pode levar de minutos a algumas horas.

### 3.5 E-mail de confirmação (pergunte agora, configure na 4.9)

Explique por que importa:

> A Salinha pede para cada pessoa confirmar o e-mail antes de entrar num
> servidor por convite. Para os e-mails de confirmação saírem, precisamos de
> um serviço de envio. O Brevo é gratuito até 300 e-mails por dia, o que sobra
> para um grupo de amigos. Quer configurar? Leva uns 10 minutos.

- **Sim** (recomendado) → seção 4.9.
- **Não** → avise o que muda: os e-mails só ficam no registro do servidor, e
  cada amigo novo precisa ser **liberado por você (IA)** com um comando antes
  de entrar por convite (seção 7.3). Conversas diretas, amizades e chamadas
  entre amigos funcionam sem isso.

## 4. Caminho VPS

### 4.1 Entrar no servidor e trocar a senha por uma chave

1. Gere uma chave só para este servidor, na sua máquina:
   ```bash
   ssh-keygen -t ed25519 -N '' -C salinha-ia -f ~/.ssh/salinha_vps
   ```
2. Instale a chave pública na VPS com a senha do root. Se houver `sshpass`
   (Linux/macOS), sem a senha na linha de comando:
   ```bash
   SSHPASS='<senha do root>' sshpass -e ssh-copy-id -i ~/.ssh/salinha_vps.pub -o StrictHostKeyChecking=accept-new root@IP
   ```
   Sem `sshpass` (ex.: Windows), peça para a pessoa abrir o **console web** do
   provedor, entrar como `root` com a senha e colar **uma linha** que você
   monta com o conteúdo de `~/.ssh/salinha_vps.pub` (a chave pública não é
   segredo):
   ```bash
   mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo 'ssh-ed25519 AAAA... salinha-ia' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys
   ```
3. Teste: `ssh -i ~/.ssh/salinha_vps root@IP 'cat /etc/os-release | head -2; uname -m'`.
   Tem que entrar **sem pedir senha**, mostrar Debian 13 ou Ubuntu 24.04 e
   `x86_64`. ARM (`aarch64`): pare e explique que este plano não serve.

Daqui em diante, todo comando "na VPS" é `ssh -i ~/.ssh/salinha_vps root@IP '...'`
(ou um `bash -s` com o bloco), ou colado pela pessoa no console web.

> Se a sua sessão acabar e a chave se perder: a pessoa ainda entra pelo
> console web do provedor com a senha do root (o console não usa SSH) e você
> repete o passo 2 com uma chave nova.

### 4.2 Segurança primeiro (5 minutos)

Diga: "Antes de instalar a Salinha, vou trancar o servidor: só eu entro, com a
chave, e só as portas que a Salinha usa ficam abertas". Peça confirmação.

Na VPS, como root:

```bash
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq && apt-get install -y -qq git curl rsync openssl ca-certificates nftables fail2ban caddy
git clone --depth 1 https://github.com/hugoemannuel/concord.git /opt/concord-src
cd /opt/concord-src/deploy
```

(Se a pessoa tiver um fork, seção 6.3, clone o fork.)

1. **SSH só por chave** ([HOSPEDAGEM.md, "Portas abertas na VPS"](../HOSPEDAGEM.md#portas-abertas-na-vps)).
   Só faça com o passo 4.1 testado (chave entrando sem senha):
   ```bash
   install -m 644 sshd-00-salinha.conf /etc/ssh/sshd_config.d/00-salinha.conf
   sshd -t && systemctl reload ssh
   sshd -T | grep -Ei '^(passwordauthentication|permitrootlogin)'   # no / without-password
   ```
   Abra uma **conexão nova** por chave para conferir, com a atual ainda aberta.
2. **fail2ban** (bloqueia quem erra a senha várias vezes):
   ```bash
   install -m 644 fail2ban-salinha-sshd.local /etc/fail2ban/jail.d/salinha-sshd.local
   systemctl enable --now fail2ban && systemctl restart fail2ban
   fail2ban-client status sshd
   ```
3. **Firewall** (tabela própria, não mexe no Docker). Com uma volta
   automática em 10 minutos, caso você fique trancada para fora:
   ```bash
   install -m 644 salinha-firewall.nft /etc/salinha-firewall.nft
   install -m 644 salinha-firewall.service /etc/systemd/system/
   nft -c -f /etc/salinha-firewall.nft
   systemd-run --unit=salinha-fw-rollback --on-active=600 nft delete table inet salinha_fw
   systemctl daemon-reload && systemctl enable --now salinha-firewall
   ```
   Abra **outra conexão SSH nova**. Entrou? Então desligue a volta:
   `systemctl stop salinha-fw-rollback.timer`. Não entrou? Espere 10 minutos
   (a tabela some sozinha) e investigue.
   **Nunca** use um `/etc/nftables.conf` com `flush ruleset`: derruba a rede
   dos containers.

Se o provedor tiver um firewall no painel (Contabo, Oracle, AWS, Magalu...),
peça para a pessoa liberar lá também: TCP 22, 80, 443 e 7881; UDP 443 e 7882.

### 4.3 Programas (10 a 15 minutos)

Na VPS:

```bash
cd /opt/concord-src
# Memória extra para compilar (VPS de 2 GB não aguenta o build do app sem isso).
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
# Docker (repositório oficial).
curl -fsSL https://get.docker.com | sh
# Go na versão do backend/go.mod.
GOV=$(awk '/^go /{print $2}' backend/go.mod)
curl -fsSL "https://go.dev/dl/go${GOV}.linux-amd64.tar.gz" | tar -C /usr/local -xz
/usr/local/go/bin/go version
# Node 22 + Yarn 1 (para gerar o app web).
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y -qq nodejs && npm i -g yarn@1.22.22
# O deploy-vps.sh fala com a VPS por ssh: aqui, com a própria máquina.
mkdir -p /root/.ssh && chmod 700 /root/.ssh && touch /root/.ssh/authorized_keys
test -f /root/.ssh/id_ed25519 || ssh-keygen -t ed25519 -N '' -q -f /root/.ssh/id_ed25519
grep -qF "$(cat /root/.ssh/id_ed25519.pub)" /root/.ssh/authorized_keys || cat /root/.ssh/id_ed25519.pub >> /root/.ssh/authorized_keys
ssh-keyscan -H localhost >> /root/.ssh/known_hosts 2>/dev/null
ssh root@localhost true && echo "ssh local ok"
```

### 4.4 Endereço

- Sem domínio: `ENDERECO` = o IP com hífens + `.sslip.io` (ex.: `203-0-113-7.sslip.io`).
  Confira: `getent hosts 203-0-113-7.sslip.io` devolve o IP.
- Com domínio: `ENDERECO` = o nome do registro A (ex.: `salinha.dominio.com.br`),
  já resolvendo para o IP (seção 3.4).

### 4.5 Configuração (`/opt/concord/.env`)

O `scripts/make-env.sh` grava o `.env` com segredos fortes (JWT e LiveKit) sem
mostrá-los, e com os valores certos para VPS: backend só em `127.0.0.1:8090`
atrás do Caddy, portas de mídia 7881/7882 e **`LIVEKIT_NODE_IP` vazio** (em
2026-10-30, com o IP preenchido, só quem tinha IPv6 entrava na call). Ele não
sobrescreve um `.env` existente.

```bash
mkdir -p /opt/concord
/opt/concord-src/scripts/make-env.sh --vps https://ENDERECO /opt/concord/.env
```

Para mudar uma linha depois (sem estragar o arquivo nem mostrar o valor):
`/opt/concord-src/scripts/make-env.sh --set NOME=valor /opt/concord/.env`.
Todas as variáveis opcionais estão explicadas em [backend/.env.example](../../backend/.env.example).

### 4.6 Serviços (backend sempre de pé e backup diário)

```bash
cd /opt/concord-src/deploy
install -m 644 concord-server.service concord-server.socket concord-backup.service concord-backup.timer /etc/systemd/system/
mkdir -p /etc/systemd/system/concord-server.service.d
install -m 644 concord-server.service.d/zero-downtime.conf /etc/systemd/system/concord-server.service.d/
systemctl daemon-reload
systemctl enable --now concord-server.socket concord-backup.timer
systemctl enable concord-server        # sobe no primeiro deploy, logo abaixo
```

### 4.7 Primeiro deploy (10 a 20 minutos)

Gera o app web (a Salinha no navegador) e publica backend, banco, servidor de
chamadas e app com o mesmo script que a Salinha oficial usa:

```bash
cd /opt/concord-src/frontend
yarn install --frozen-lockfile --ignore-scripts
WEB_PUBLIC_URL=https://ENDERECO yarn build:web
cd /opt/concord-src
PATH=/usr/local/go/bin:$PATH scripts/deploy-vps.sh root@localhost
```

Esperado no fim: `backend no ar (/healthz ok)`. O aviso de que
`backend/.release-key` não existe é normal (só importa para instaladores
desktop, seção 6.3). Conferir: `curl -s http://127.0.0.1:8090/healthz` →
`{"status":"ok"}` e `docker ps` mostra `concord-postgres` e `concord-livekit`.

### 4.8 Endereço com HTTPS (Caddy)

Primeira vez (ninguém usando ainda), direto:

```bash
cd /opt/concord-src
sed 's/SEU-ENDERECO/ENDERECO/g' deploy/Caddyfile.modelo > /etc/caddy/Caddyfile
chmod 644 /etc/caddy/Caddyfile
chmod o+x /opt/concord
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl enable caddy && systemctl restart caddy
```

O Caddy tira o certificado sozinho em segundos (precisa das portas 80 e 443).
Mudanças futuras no Caddyfile: use `scripts/apply-caddyfile.sh`, que confere,
guarda backup e volta se algo falhar ([HOSPEDAGEM.md](../HOSPEDAGEM.md#caddyfile-todos-os-endereços-da-vps)).

### 4.9 Opcionais (pergunte um por vez; cada um tem o que se perde sem ele)

Grave cada valor com `make-env.sh --set` e, no fim, reinicie o backend:
`systemctl restart concord-server` (não derruba chamadas).

| Recurso | Sem ele | Como ligar |
|---|---|---|
| **E-mail** (recomendado) | e-mails de confirmação e de "esqueci a senha" não saem; cada amigo novo precisa ser liberado à mão (seção 7.3) e quem esquecer a senha depende de você | Conta grátis no [Brevo](https://www.brevo.com) (300 e-mails/dia). Em "SMTP e API": servidor `smtp-relay.brevo.com`, porta `587`, o **login SMTP** mostrado na página e uma **chave SMTP** nova (não é a senha da conta). Em "Remetentes", cadastre e confirme o e-mail da pessoa. Grave `SMTP_HOST`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASS` e `MAIL_FROM='Salinha <email-confirmado@...>'`. O `APP_URL` já é o endereço do servidor (links dos e-mails). Confira no log: `journalctl -u concord-server -n 50` não pode ter `SMTP_HOST/MAIL_FROM vazios`. |
| **GIFs** (aba GIF do seletor) | a aba mostra "Nenhum GIF encontrado" | Chave grátis em [developers.giphy.com](https://developers.giphy.com): `GIPHY_API_KEY`. |
| **Spotify** ("Ouvir no Spotify" abre a faixa) | o botão abre a busca do Spotify (Apple Music, Deezer e YouTube funcionam sem chave) | App no Spotify for Developers: `SPOTIFY_CLIENT_ID` e `SPOTIFY_CLIENT_SECRET` ([ADR 0033](../adr/0033-links-diretos-do-ouvir-tambem.md)). |
| **Notificação no Android** (push) | só serve com o APK próprio (seção 6.4); no navegador não muda nada | Projeto Firebase: [docs/PUSH.md](../PUSH.md) (`FCM_SERVICE_ACCOUNT_FILE`). |
| **Bot de música** (Maestro) | nada a fazer: o `deploy-vps.sh` já instala `ffmpeg` e `yt-dlp` | Se o YouTube bloquear o IP: [HOSPEDAGEM.md, "PO token"](../HOSPEDAGEM.md#po-token-quando-o-youtube-bloquear-o-ip). |

### 4.10 Verificação final (você roda)

Da sua máquina (ou da VPS):

```bash
curl -fsS https://ENDERECO/healthz                                         # {"status":"ok"}
curl -s -o /dev/null -w '%{http_code}\n' https://ENDERECO/rtc/validate      # 401 (é o LiveKit: certo)
curl -s -o /dev/null -w '%{http_code}\n' https://ENDERECO/api/users/me      # 401
curl -fsS https://ENDERECO/friends | grep -c '<div id="root">'              # 1 (o app abre em qualquer rota)
```

Na VPS: `ss -tulnp` só mostra para fora (`0.0.0.0`/`[::]`) as portas 22, 80,
443 e as do LiveKit (7881, 7882); Postgres, API do LiveKit e o backend ficam
em `127.0.0.1`.

Depois, com a pessoa:

1. "Abra **https://ENDERECO** no navegador (Chrome, Edge ou Firefox) e crie a
   sua conta." Se o e-mail estiver ligado, ela confirma pelo link; se não,
   libere a conta dela (seção 7.3).
2. "Crie um servidor (o botão **+** na barra da esquerda) e um canal de voz."
3. **Teste de chamada com duas abas:** ela abre uma **janela anônima**, cria
   uma segunda conta de teste, entra no servidor pelo link de convite (seção
   7.2) e as duas abas entram no mesmo canal de voz. Microfone e câmera
   precisam ser permitidos no navegador. Tem que aparecer o indicador de fala
   e a imagem da câmera do outro lado.
4. **Teste de fora de casa:** no celular, com o **Wi-Fi desligado** (internet
   do chip), abrir o link, entrar e falar na chamada. Isso confere que as
   portas de mídia estão abertas para a internet.

### 4.11 Fechar

1. Peça para a pessoa **trocar a senha do root** no painel do provedor
   ("redefinir senha"), porque ela foi colada no chat. Se ela colou também a
   senha da conta do provedor, que troque essa também. O login por senha no
   SSH já está desligado; a senha nova serve só para o console web.
2. Entregue o resumo da seção 7.

## 5. Caminho PC com playit (o próprio computador)

Siga [HOSPEDAGEM.md, seções 1 a 6](../HOSPEDAGEM.md#1-preparar-o-pc), que é
como o servidor oficial rodou antes da VPS. Resumo do que é diferente para um
leigo:

- **Custos e limites para dizer antes:** o PC ligado 24 h (energia), cabo de
  rede, sem suspender; o **playit premium** (~US$ 3/mês) para os túneis de voz
  e vídeo; tudo trafega **sem criptografia** (HTTP), e os amigos usam **só o
  app desktop** (o navegador não libera o microfone fora de HTTPS).
- **Conta e túneis no playit.gg**, conduzindo a pessoa pelo site:
  1. Ela cria a conta em [playit.gg](https://playit.gg) e assina o premium
     (confirme antes: é pago).
  2. Instala o agente (Linux: `playit` no `PATH` e
     `playit-cli --socket-path ~/.local/share/playit/playitd.sock setup`, que
     mostra um link para ela abrir e vincular; Windows: o instalador do site,
     que abre o link sozinho).
  3. No painel, **3 túneis** apontando para `127.0.0.1`: "Salinha API" TCP na
     porta 8080; "Salinha mídia" **UDP** e "Salinha mídia TCP" TCP, cada um com
     **porta local igual à porta pública** que o playit der. Peça os endereços
     (ex.: `abc.gl.at.ply.gg:41234`).
- **Configuração:** `scripts/make-env.sh --pc http://<endereço do túnel API> backend/.env`
  e depois, com `--set`: `LIVEKIT_UDP_PORT` e `LIVEKIT_TCP_PORT` (as portas dos
  túneis de mídia) e `LIVEKIT_NODE_IP` = saída de
  `scripts/playit-ip.sh <endereço do túnel UDP>`. **Só aqui** o
  `LIVEKIT_NODE_IP` é preenchido.
- **Linux:** `scripts/server-up.sh` sobe tudo; `scripts/install-services.sh`
  deixa o servidor e o playit sempre de pé (com o vigia do túnel). Instaladores
  para os amigos: `scripts/release-win.sh` e `scripts/release-linux.sh`
  (precisam do Docker; geram e assinam com `backend/.release-key`, faça backup
  dela).
- **Windows** (caminho menos testado; se travar, recomende a VPS):
  - Instale Docker Desktop, Git (com o Git Bash), Go e Node 22 + Yarn 1. Rode
    os scripts `.sh` no Git Bash.
  - Banco: `cd backend && docker compose up -d postgres`. **O LiveKit no
    Docker Desktop não passa mídia** (o `network_mode: host` não funciona no
    Windows): use o `livekit-server.exe` nativo (das
    [releases do LiveKit](https://github.com/livekit/livekit/releases), versão
    do `backend/docker-compose.yml`) com um `livekit.yaml` igual ao
    `LIVEKIT_CONFIG` do compose, trocando as variáveis pelos valores do `.env`
    e acrescentando `keys: { concord: <LIVEKIT_API_SECRET> }` (gere o arquivo
    com um script que lê o `.env`, sem mostrar o segredo):
    `livekit-server.exe --config livekit.yaml`.
  - Backend: `cd backend && go build -o concord-server.exe ./cmd && ./concord-server.exe`
    (lê o `backend/.env`).
  - Instaladores para os amigos: o `scripts/build-win.sh http://<túnel API>`
    roda o build dentro do Docker; no Windows, rode-o no **WSL2 (Ubuntu)** com
    a integração do Docker Desktop ligada.
- **E-mail:** sem app web (sem HTTPS) os links dos e-mails não abrem nada.
  Deixe o SMTP vazio e libere as contas à mão (seção 7.3, trocando o `ssh` por
  `docker exec` local).

## 6. O app que os amigos usam

A URL do servidor é **constante de build**: o app desktop oficial e o APK
oficial só falam com a Salinha oficial. Para o servidor da pessoa:

### 6.1 Navegador (padrão, já pronto na VPS)

O app web gerado na 4.7 fala com a **mesma origem** da página (API em `/api`,
chat em `/ws`, chamadas em `/rtc`), então funciona em qualquer endereço sem
recompilar. Os amigos só abrem **https://ENDERECO**: computador (Chrome, Edge,
Firefox) e celular (Chrome no Android, Safari no iPhone). No navegador não há
bandeja, overlay de jogo nem som da tela no Firefox (no Chrome/Edge, marcar
"Compartilhar áudio").

### 6.2 Celular

O mesmo link no navegador do celular. Dica: "Adicionar à tela inicial" deixa
um ícone como de app.

### 6.3 Instaladores desktop próprios (opcional, com atualização automática)

Só se a pessoa quiser o app instalado (bandeja, iniciar com o Windows, som da
janela compartilhada). Caminho mais simples que funciona: **fork + GitHub
Actions**, o mesmo fluxo da Salinha oficial
([HOSPEDAGEM.md, "Deploy automático (GitHub Actions)"](../HOSPEDAGEM.md#postgres-e-livekit-não-são-recriados-no-deploy)
e [ADR 0028](../adr/0028-atualizacoes-pelo-github-releases.md)).
O que ela precisa criar: uma **conta no GitHub** (grátis). Você faz o resto
com o `gh` CLI (ela faz o `gh auth login` com o código que aparece).

1. Fork público de `hugoemannuel/concord`; na aba **Actions** do fork, ligar os
   workflows.
2. Na VPS: chave de assinatura das atualizações e chave de deploy, sem mostrar
   o conteúdo:
   ```bash
   openssl genpkey -algorithm ed25519 -out /opt/concord-src/backend/.release-key && chmod 600 /opt/concord-src/backend/.release-key
   ssh-keygen -t ed25519 -N '' -q -C deploy-github -f /root/deploy-github
   cat /root/deploy-github.pub >> /root/.ssh/authorized_keys
   ```
   **A `.release-key` precisa de backup** (sem ela, os apps instalados recusam
   as atualizações): peça para a pessoa guardar uma cópia num lugar seguro.
3. Secrets do fork (`gh secret set NOME -R usuario/concord < arquivo`, lendo
   direto do arquivo, sem passar pela conversa): `VPS_SSH_KEY` (o
   `/root/deploy-github`), `VPS_KNOWN_HOSTS` (`ssh-keyscan IP`), `RELEASE_KEY`
   (a `.release-key`) e `CHANGELOG_TOKEN` (`openssl rand -hex 24`; sem ele o
   passo "Changelog" do workflow falha).
4. Variables: `DEPLOY_ENABLED=true`, `VPS_HOST=root@IP`,
   `PUBLIC_URL=https://ENDERECO`, `WEB_URL=https://ENDERECO` (também vira o
   endereço alternativo embutido no app; sem ele o padrão é o servidor
   oficial) e `SITE_URL=https://baixar.ENDERECO`.
5. No Caddyfile da VPS: descomente as duas linhas do `@release` (com o
   usuário e o nome do fork) e o bloco `baixar.ENDERECO` (com domínio próprio,
   crie antes o registro A `baixar`). Aplique com
   `scripts/apply-caddyfile.sh root@IP Caddyfile`.
6. Rode o workflow **Deploy** no fork (Actions → Deploy → Run workflow, na
   `main`). Ele gera e assina os instaladores, publica a release no fork e faz
   o deploy na VPS. A página de download fica em `https://baixar.ENDERECO`.
7. Daí em diante, atualizar = **"Sync fork"** no GitHub (dispara o deploy). Não
   misture com o `self-update.sh` da seção 7.4.

Limites conhecidos: no app desktop o link de convite copiado aponta para o
app web oficial (mande o **código**, seção 7.2), e o botão "Usar no navegador"
da página de download leva ao app oficial.

### 6.4 APK Android próprio (avançado)

Exige Android SDK e JDK: `EXPO_PUBLIC_SERVER_URL=https://ENDERECO node scripts/mobile-build.mjs`
([ADR 0021](../adr/0021-app-mobile-expo.md); push em [docs/PUSH.md](../PUSH.md)).
Para um leigo, o navegador do celular (6.2) resolve.

## 7. O que entregar à pessoa

Mande um resumo curto, nesta ordem:

### 7.1 O link

"A sua Salinha está em **https://ENDERECO**. Guarde esse endereço."

### 7.2 Como convidar amigos

No servidor dela: clicar no nome do servidor (no topo) → **Convidar pessoas**
(ou no botão **Convidar** da barra do canal) e **Copiar** o **link de convite** (no app web, o link já é do servidor
dela) e mandar no WhatsApp. O amigo abre o link, cria a conta e entra. Também
dá para mandar só o **código** (ex.: `K7P2QX9M`): o amigo usa **+ → Entrar
com código**.

### 7.3 Liberar a conta de um amigo (só sem e-mail configurado)

Sintoma: o amigo vê "Confirme seu e-mail para liberar convites e entrada em
servidores". Peça o **nome de usuário** dele e rode na VPS:

```bash
docker exec concord-postgres psql -U concord-user -d concord -c "UPDATE users SET email_verified_at = NOW() WHERE lower(username) = lower('fulano') AND email_verified_at IS NULL"
```

`UPDATE 1` = liberado (vale na hora).

### 7.4 Como atualizar no futuro

"Quando quiser a versão mais nova da Salinha, peça a uma IA com acesso ao
servidor para rodar a atualização." O comando, na VPS (não derruba quem está
em chamada):

```bash
/opt/concord-src/scripts/self-update.sh
```

Com o fork da seção 6.3: "Sync fork" no GitHub.

### 7.5 Backup

O banco é copiado todo dia em `/opt/concord/backups` (14 dias) pelo
`concord-backup.timer`. Fotos e vídeos do chat ficam em `/opt/concord/uploads`
e não entram nessa cópia. Para ter uma cópia fora da VPS, ative o backup
automático do provedor (alguns cobram à parte) ou baixe de vez em quando:
`rsync -a root@IP:/opt/concord/backups/ ./backups-salinha/`. Restaurar:
[HOSPEDAGEM.md, "Restaurar o banco de um backup"](../HOSPEDAGEM.md#postgres-e-livekit-não-são-recriados-no-deploy).

### 7.6 Trocar para um domínio próprio depois

Comprar o `.com.br` no [Registro.br](https://registro.br) (~R$ 40 por ano;
confirme antes), criar o registro A (seção 3.4), e na VPS: novo Caddyfile com
o novo endereço (4.8, via `apply-caddyfile.sh`), `make-env.sh --set` de
`PUBLIC_URL`, `API_PUBLIC_URL` e `APP_URL`, e `self-update.sh` (gera o app web
de novo). Contas e conversas continuam; o link antigo para de valer.

### 7.7 Se cair: sintomas e soluções

| Sintoma | Causa provável | O que fazer (na VPS) |
|---|---|---|
| O site não abre | VPS desligada, Caddy parado ou certificado | painel do provedor (está ligada?); `systemctl status caddy`; `journalctl -u caddy -n 50` |
| Abre, mas "Reconectando ao servidor…" sem parar | backend parado | `systemctl status concord-server`; `journalctl -u concord-server -n 50`; `curl -s 127.0.0.1:8090/healthz` |
| Entra na chamada mas fica sem som/vídeo para todos | portas de mídia fechadas (firewall do painel do provedor) ou LiveKit parado | liberar UDP 7882 e TCP 7881 no painel; `docker ps`; `docker logs concord-livekit --tail 50` |
| **Só quem tem IPv6 entra na call** | `LIVEKIT_NODE_IP` preenchido | `make-env.sh --set LIVEKIT_NODE_IP=` e `scripts/deploy-vps.sh --infra root@localhost` com ninguém em chamada (recria o LiveKit) |
| Amigo não entra no servidor pelo convite | e-mail não confirmado | e-mail configurado (4.9) ou liberar a conta (7.3) |
| Não chega e-mail de confirmação | SMTP errado ou remetente não confirmado no Brevo | `journalctl -u concord-server \| grep mailer`; conferir login, chave e remetente |
| "Upload recusado" / disco cheio | menos de 5 GB livres | `df -h`; apagar arquivos velhos ou aumentar o disco no painel |
| Deploy avisa `docker-compose.yml/.env mudou ... --infra` | mudança de banco/LiveKit pendente | com ninguém em chamada: `PATH=/usr/local/go/bin:$PATH /opt/concord-src/scripts/deploy-vps.sh --infra root@localhost` |
| Bot de música "fora do ar" | YouTube bloqueou o IP | [HOSPEDAGEM.md, "PO token"](../HOSPEDAGEM.md#po-token-quando-o-youtube-bloquear-o-ip) |

## 8. Custos e limites (diga com honestidade)

- **VPS**: R$ 40 a R$ 100 por mês. **Domínio** (opcional): ~R$ 40 por ano.
  **E-mail** (Brevo): grátis até 300 por dia. **playit** (só no caminho do
  PC): ~US$ 3 por mês.
- **Tráfego**: toda mídia passa pelo servidor, que repassa cada fala, câmera e
  tela para cada pessoa da chamada. Ordem de grandeza por pessoa que recebe:
  voz ~50 kbit/s por quem fala; câmera ~0,5 a 1,5 Mbit/s; tela ~1,5 a
  4 Mbit/s. Exemplo: 5 amigos assistindo a uma tela por 3 horas/dia gastam
  ~0,5 a 1 TB por mês. Com telas todo dia, conte **2 a 3 TB/mês** (o número
  da Salinha oficial).
- **Quantas pessoas**: cada sala de chamada aceita até **25** participantes
  (`max_participants` no `backend/docker-compose.yml`). Uma VPS de 2 vCPU/4 GB
  aguenta com folga um grupo de amigos (dezenas de pessoas, algumas chamadas ao
  mesmo tempo); o que acaba primeiro costuma ser a banda e o tráfego do plano,
  não o processador.
- **Privacidade**: a mídia vai criptografada até o servidor, mas não é de
  ponta a ponta; quem administra o servidor poderia acessá-la
  ([HOSPEDAGEM.md, "Segurança"](../HOSPEDAGEM.md#segurança)). Os dados dos
  amigos ficam na VPS da pessoa, que passa a ser a responsável por eles.

## 9. Referência rápida

| O quê | Onde |
|---|---|
| Gerar/alterar o `.env` | `scripts/make-env.sh` (`--vps`, `--pc`, `--set`) |
| Publicar/atualizar | `scripts/deploy-vps.sh root@localhost` (na VPS); `scripts/self-update.sh` (pull + app web + deploy) |
| Caddyfile do servidor próprio | `deploy/Caddyfile.modelo`; mudanças com `scripts/apply-caddyfile.sh` |
| Serviços da VPS | `deploy/concord-server.service`, `.socket`, `concord-server.service.d/`, `concord-backup.*` |
| Segurança da VPS | `deploy/sshd-00-salinha.conf`, `deploy/fail2ban-salinha-sshd.local`, `deploy/salinha-firewall.*` |
| PC com playit | `scripts/server-up.sh`, `scripts/playit-ip.sh`, `scripts/install-services.sh` |
| Instaladores | fork + `.github/workflows/deploy.yml`; local: `scripts/release-win.sh`, `scripts/release-linux.sh`, `scripts/build-linux.sh` |
| Detalhes de tudo | [docs/HOSPEDAGEM.md](../HOSPEDAGEM.md) |

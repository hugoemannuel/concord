# 0056. Mostrar os plugins da comunidade como página do autor num iframe isolado

- Status: aceito
- Data: 2026-11-02

## Contexto

A proposta #480 (placar ao vivo de Atlético-MG e Cruzeiro) virou um sistema de
plugins: gente que programa cria um plugin, o time aprova, o admin do servidor
instala e cada membro liga para si. As forças:

- **Segurança da conta**: a Salinha não pode rodar o código do autor junto da
  sessão de quem usa (token, `window.api` do preload, WebSocket).
- **Desktop e web com o mesmo código**: o renderer é o mesmo nos dois; o que só
  existe no Electron não serve para a web.
- **Encaixe na UI**: a #480 pede um painelzinho ao lado dos pinados, não uma
  janela.
- **Servidor próprio**: quem hospeda a Salinha não pode ganhar passo de
  infraestrutura (DNS, certificado) por causa disso.
- **Padrão do repo**: as Atividades já mostram página de terceiros, num iframe na
  web (`ActivityPanel.tsx`) e numa janela isolada no desktop
  (`main/activity/activityPolicy.ts`). A CSP do desktop hoje barra qualquer frame
  de fora (`default-src 'self'`) e a da web só libera as origens das Atividades
  (`WEB_EXTRA_CSP`).

## Opções consideradas

1. **Iframe com `sandbox` num popover.** A página do autor roda num
   `<iframe sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox">`,
   sem `allow-same-origin` (origem opaca: sem cookies, sem storage, sem acesso ao
   DOM da Salinha) e sem `allow-top-navigation`. A CSP passa a aceitar
   `frame-src https:`; o que limita é o backend só entregar URL de ficha aprovada.
   Prós: mesmo código na web e no desktop, cabe no popover, nada de infra.
   Contras: `frame-src` mais aberto; a defesa contra página enganosa é a aprovação
   do time.
2. **Janela própria por plugin** (como as Atividades no desktop). Prós: o
   isolamento mais forte (sessão separada, sem preload). Contras: não existe na
   web e não é o painelzinho que a #480 pede.
3. **Proxy por subdomínio próprio** (o `discordsays.com` das Activities do
   Discord). Prós: CSP fechada num só host, dá para auditar e cortar o tráfego.
   Contras: DNS e certificado novos em toda instalação (servidor próprio), e o
   nosso servidor paga o tráfego dos plugins.

## Decisão

Opção 1. É a mais simples que atende o pedido, reaproveita o padrão do iframe das
Atividades na web e não pede infraestrutura nova. A ficha guarda só a URL do
painel; trocar para a opção 3 no futuro muda quem serve a URL, não a ficha.

## Consequências

- `frame-src https:` na CSP do desktop e da web.
- O ícone da ficha vem de uma lista fixa de SVGs da Salinha (`quebra-cabeca`, `bola`); não há URL externa de ícone, que vazaria o IP de quem vê o botão.
- O main do Electron não muda: o `sandbox` impede o plugin de navegar a janela, e
  os popups dele caem no `setWindowOpenHandler` atual (http/https no navegador de
  fora; link de convite só abre a confirmação). A navegação dentro do iframe não é presa à origem: exigiria IPC novo e quebraria
  redirecionamentos, sem ganho real (o autor já controla o conteúdo da URL).
- No desktop, um plugin aprovado pode abrir abas do navegador em sequência com
  `window.open` (o Electron não bloqueia popups). Aceito nesta versão: a retirada
  pelo time é o freio, e um limite como o `gate` da janela das Atividades
  (`main/activity/activityWindow.ts`) fica para depois.
- O ícone do plugin não é carregado do servidor do autor (vazaria o IP de quem vê
  a barra): nesta versão é genérico, e na loja vira upload servido pela Salinha.
- O painel não recebe nada da Salinha nesta versão (nem quem vê, nem o canal).
  Um SDK por `postMessage` com permissões fica para quando algum plugin precisar.
- Página que se passa pela Salinha é barrada na aprovação e o painel sempre
  mostra o autor e "conteúdo de fora da Salinha".

## Fontes

- MDN, atributo `sandbox` do `<iframe>`: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe#sandbox
- Electron, segurança (navegação e `setWindowOpenHandler`): https://www.electronjs.org/docs/latest/tutorial/security
- Discord Embedded App SDK (Activities em iframe e proxy): https://discord.com/developers/docs/activities/overview

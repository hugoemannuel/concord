# Ligar plugins pela barra do canal (design curto)

Data: 2026-11-05. Continuação de [plugins-base](2026-11-02-plugins-base-design.md)
(ADR 0049/0056). Só frontend; a API não muda.

## Por quê

Depois de ir ao ar, o dono do projeto achou que mandar o membro em Configurações do
servidor → Plugins para ligar um plugin não faz sentido: é escondido e mistura o
gesto pessoal (ligar para mim) com a administração (instalar no servidor).

## O que muda

- **Quebra-cabeça fixo na barra do canal** (ao lado dos pinados, onde ficam hoje os
  botões dos plugins), para todo membro, **só quando o servidor tem pelo menos 1
  plugin instalado**. Sem plugin instalado, a barra fica igual a hoje (quem não usa
  plugins não vê diferença).
- **Clicar no quebra-cabeça** abre um menu com os plugins instalados: nome, descrição
  curta e um interruptor (`Switch`) de liga/desliga, só para a pessoa (mesma ação
  `toggleAction` de hoje, com o mesmo erro em toast).
- **Ícones ao lado**: cada plugin ligado ganha o seu ícone (`pluginIcon`, ex.: bola)
  ao lado do quebra-cabeça e abre o painel com um clique, como hoje. **No máximo 2**
  ícones; os demais ligados abrem pelo menu.
- **Configurações do servidor → Plugins** volta a ser só de quem gerencia o servidor
  (`MANAGE_SERVER`, dono ou Administrador): instalar e desinstalar. O interruptor
  do membro sai de lá. Sai a flag `everyone` de `serverSettingsNav.ts`, então o
  item "Configurações" do menu do servidor volta a aparecer só para quem tem alguma
  permissão de configuração (reverte o efeito dos commits `dba914b4`/`56ad26a4`).

## Abordagens

1. **Escolhida: o menu atual do quebra-cabeça ganha os interruptores.** O botão e o
   menu já existem em `PluginHeaderButtons` (hoje só com 3+ ligados e só para abrir).
   Mudança pequena, sem tela, API nem dependência nova.
2. Descartada: a seção das Configurações num popover. Feita para página larga, mistura
   instalar/desinstalar, aperta no celular.
3. Descartada: modal com a lista. Pesado para um liga/desliga e tira a pessoa do chat.

## Decisões do agente (para conferir)

- No menu, clicar no **nome** de um plugin ligado abre o painel; desligado, o nome não
  faz nada (o interruptor é o controle).
- Com mais de 2 ligados, os ícones da barra são os **2 primeiros** na ordem da lista.
- Ligar um plugin pelo menu não abre o painel sozinho; o ícone aparece ao lado.
- O menu continua fechando com Esc/clique fora e devolvendo o foco ao quebra-cabeça.

## Restrições

- Responsivo de 360 px a telas largas, toque e teclado (menu cabe na tela, linhas e
  interruptores com alvo ≥ 40 px). Componentes de `shared/ui` (`IconButton`, `Switch`),
  tokens e `focus-ring`.
- CRAP ≤ 15 nas funções tocadas; `PluginHeaderButtons.tsx` (~130 linhas) pode ser
  dividido (menu num arquivo próprio) se crescer.
- TDD: testes de `headerPlugins` (limite de 2, mostrar o quebra-cabeça só com
  instalado), do menu (interruptor chama a ação, nome abre o painel só se ligado),
  da seção de Configurações (sem interruptor) e de `serverSettingsNav` (Plugins só
  com `MANAGE_SERVER`).

## Texto de UI (precisa de aprovação humana)

- Configurações, legenda para quem gerencia: hoje "Instalar só deixa o plugin
  disponível. Cada membro escolhe se quer usar." → proposta: "Instalar só deixa o
  plugin disponível. Cada membro liga o que quiser pelo quebra-cabeça na barra do canal."
- Título da seção nas Configurações: fica "Instalados neste servidor".
- O menu não ganha texto novo (nome e descrição vêm da ficha; rótulo do botão segue
  "Plugins").

## Fora do escopo

App Android, backend, loja de plugins (spec 2).

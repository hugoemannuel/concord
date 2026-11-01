# 0040. Temas próprios da aparência: paleta gerada no cliente a partir de poucas cores, lista na conta

- Status: aceito
- Data: 2026-10-31

## Contexto

Issue #486 ("Se você gosta de vermelho e branco, seria top ver essa combinação na
HUD do seu Salinha"). Pedido do dono: criar temas próprios do app como já dá para
customizar o perfil, partindo de um tema pronto, com prévia ao vivo, vários temas
nomeados e sincronização entre aparelhos; os 8 temas prontos continuam como hoje.

Forças: o app inteiro já é pintado por ~45 tokens semânticos (`assets/theme.css`,
blocos `[data-theme]`), e o teste `settings/lib/themes.test.ts` garante AA em todos
os temas prontos. Um tema próprio não pode quebrar nenhuma tela nem deixar texto
ilegível, qualquer que seja a escolha da pessoa. A prévia dos cartões já funciona
pondo `data-theme` num elemento. O tema em uso é preferência local (localStorage)
e o overlay de jogo lê a mesma escolha.

## Opções consideradas

1. **Pessoa edita os ~45 tokens.** Poder total, mas fácil de quebrar contraste e
   cansativo; o "editar o perfil" do app escolhe poucas cores, não dezenas.
2. **Paleta tonal no estilo Material (HCT) ou Radix (escalas de 12 passos) a partir
   de uma cor.** Resultado bonito, mas precisa de espaço de cor novo (ou
   dependência) e não respeita fundos que a pessoa quer escolher um a um.
3. **Poucas escolhas (destaque, fundo principal, barra lateral, cartões, texto,
   brilho) + derivação e correção de contraste** (o que fazem os geradores de
   cor acessível: ajustar a luminosidade mantendo o matiz até passar a razão
   alvo). Simples, sem dependência, testável como função pura.

Aplicar no DOM: (a) estilo inline no `<html>`; (b) um `<style>` gerado com um bloco
`[data-theme='custom-<id>']` por tema, igual aos prontos.

Onde guardar: (i) só localStorage; (ii) a lista na conta (`internal/apptheme`, uma
linha JSONB por pessoa), como os sons do app (ADR 0035).

## Decisão

Opção 3 com (b) e (ii).

- `features/appearance/lib/palette.ts` gera todos os tokens. O esquema (claro ou
  escuro) sai do fundo principal; os fundos são puxados para a faixa do esquema
  (escuro: luminância ≤ 0,12; claro: ≥ 0,5); texto, link, marca e avisos são
  empurrados rumo ao branco (ou preto) até passar 4,6:1 em todos os fundos reais,
  inclusive com os véus de hover/selecionado e com o brilho atrás; a marca escurece
  até o texto branco dos botões passar AA; indicadores ficam ≥ 3:1. O que precisou
  mudar volta em `adjusted` e vira um aviso no editor. O teste roda as mesmas
  exigências dos temas prontos em 157 entradas (casos-limite + 150 aleatórias).
- "Brilho de fundo" (só no escuro) liga as bolhas do fundo animado, pintadas com a
  cor do brilho (`--hero-1..4`, fallback nas cores fixas), e deixa os painéis
  translúcidos como o Roxo neon.
- Tema próprio vira `data-theme="custom-<id>"` e `data-scheme` diz claro/escuro
  (o bloco LEGADO do tema claro e as setas de `select` passam a valer também em
  `[data-scheme='light']`). O `<style>` é reescrito quando a lista muda; a prévia
  do editor usa outro `<style>` com `custom-draft`.
- A lista (até 10, `{id, name, accent, background, sidebar, card, text, glow}`)
  fica em `user_app_themes` (GET/PUT `/users/me/app-themes`, lista inteira,
  validada no backend) e numa cópia local (`concord:custom-themes`), que faz o app
  abrir com as cores certas e alimenta o overlay. **Qual tema está em uso continua
  sendo escolha de cada aparelho** (`concord:theme`, agora aceitando `custom-<id>`):
  num aparelho novo o tema aparece em "Seus temas" e é um clique.

Nativo (Rust) não ganha nada aqui: é CSS e contas pequenas no renderer.

## Consequências

- Token novo em `theme.css` precisa entrar no gerador (o teste da paleta cobre
  `THEME_TOKENS` e falha se faltar).
- PUT com a lista inteira: duas edições simultâneas em aparelhos diferentes, a
  última vence (aceitável para preferência pessoal).
- Sem imagem de fundo (precisaria de upload e de contraste sobre imagem); fica
  para depois, se pedirem.
- Mobile (`mobile/`, tokens próprios em `shared/theme/tokens.ts`) ainda não lê os
  temas próprios: pendência registrada.

## Fontes

- WCAG 2.2, 1.4.3 Contraste (mínimo) e 1.4.11 Contraste não textual: https://www.w3.org/TR/WCAG22/
- Material Design 3, Dynamic color (paletas tonais a partir de uma cor): https://m3.material.io/styles/color/dynamic-color/overview
- Radix Colors, custom palette (escalas a partir de destaque e fundo): https://www.radix-ui.com/colors/custom
- AccessibleColors (ajuste de luminosidade até a razão alvo): https://www.nuget.org/packages/AccessibleColors/

# 0041. Aparência v2: edição ao vivo no app inteiro, degradês, vidro e forma nos temas próprios

- Status: aceito (ampliado pela [0043](0043-aparencia-v3.md): brilho visível, efeitos, imagem de fundo e mais fontes)
- Data: 2026-11-01
- Complementa: [0040](0040-aparencia-personalizada.md)

## Contexto

Retorno do dono sobre a v1 (ADR 0040): faltam opções, degradês das cores e, principalmente,
ver o resultado enquanto mexe ("senão eu só descubro no final"). A v1 mostrava só um mini-mock
dentro das Configurações, que tapam o app inteiro. Forças: o contraste AA continua garantido
para qualquer escolha; nada pode pesar em PC fraco (arrastar o seletor de cor gera dezenas de
eventos por segundo e o app tem centenas de elementos); os temas da v1 já salvos não podem
mudar nem se perder; sem dependência nova.

## Opções consideradas

Edição ao vivo:

1. **Mini-mock maior** (v1 ampliada). Não mostra o app de verdade.
2. **Iframe com o app** (como o Live LESS Theme Customizer). Duplica o app, pesado no Electron.
3. **Aplicar o rascunho no próprio app** (como o editor de tema da Shopify, que gera variáveis
   CSS num `<style>`): o `<html>` passa a mostrar `data-theme="custom-draft"` enquanto edita,
   e o editor vira um painel flutuante que sobrevive a fechar as Configurações.

Degradês: (a) trocar os tokens de cor por imagens (quebraria `bg-x/20`, bordas, recortes de
avatar); (b) **manter os tokens como cor sólida (base e reserva) e pôr o degradê por cima em
`background-image`**, por variáveis `--fill-*` que só os temas próprios definem.

Vidro: `backdrop-filter` em painéis grandes é caro, ainda mais com o fundo animado atrás.

## Decisão

Opção 3 e (b).

- **Ao vivo**: `features/appearance/store/themeEditorStore.ts` guarda a sessão (rascunho com
  desfazer/refazer, painel recolhido, se escondeu as Configurações). Cada mudança vai para
  `lib/livePreview.ts`, que junta tudo do mesmo quadro (`requestAnimationFrame`), escreve o
  bloco `custom-draft` e liga `setThemePreview` no `themeStore` (o documento mostra o
  rascunho sem mexer na escolha salva). Enquanto as cores mudam, `data-theme-live` desliga as
  transições do app. Gerar a paleta custa ~2 ms. Cancelar/Esc desliga a prévia: o app volta
  exatamente ao tema de antes. O painel (`components/editor/ThemeEditorPanel.tsx`, montado no
  `App` por `ThemeEditorHost`) fica à direita no desktop e vira folha de baixo no celular, com
  "Ver o app" (fecha as Configurações; elas voltam ao terminar), recolher e Ctrl+Z/Ctrl+Shift+Z.
- **Degradês** (destaque, fundo principal, barra lateral, cartões): base + 1 ou 2 cores, linear
  (8 direções, a UX do fundo do cartão de perfil) ou radial. Cada parada é puxada para a faixa
  do esquema e entra na lista de fundos onde o texto precisa passar AA; no destaque, cada
  parada escurece até o texto branco passar. As regras ficam em `assets/themeDecor.css`, na
  camada `components` (uma classe explícita como `hover:bg-gradient-brand` continua ganhando).
- **Vidro** (0–100): opacidade dos painéis e desfoque de até 20 px, só nos temas próprios
  (`--panel-backdrop`; sem vidro, `none`, mais leve que o `blur(40px)` dos prontos). Com vidro,
  o degradê do fundo principal vai para a janela atrás dos painéis (cor e imagem translúcidas
  somadas deixariam o painel opaco). `prefers-reduced-transparency` deixa tudo opaco; com
  `prefers-reduced-motion` as bolhas do fundo param.
- **Mais opções**: realce (links e item selecionado), texto secundário, bordas (as três com
  "automático"), intensidade do brilho, cantos (escala do raio do Tailwind, 0–200%),
  densidade (`--spacing`; o compacto só vale com mouse, para não encolher alvos de toque) e
  fonte entre Outfit, a do sistema, serifada e mono (nada baixado). Seis pontos de partida
  novos (entre eles "Vermelho e branco", da issue #486) e "Gerar a partir de uma cor"
  (fundos tingidos da cor e realce num matiz vizinho).
- **Formato**: os campos novos são opcionais no JSON. Tema da v1 lido do servidor ou do
  localStorage ganha os padrões que reproduzem a v1 (o vidro da v1 vinha com o brilho:
  `glass = 40` quando há brilho). O backend (`internal/apptheme/style.go`) valida e completa
  os mesmos padrões; sem migration (a coluna já é JSONB).

Nativo (Rust) não ganha nada: é CSS e contas pequenas no renderer.

## Consequências

- O app inteiro repinta a cada quadro enquanto se arrasta uma cor (recalcular estilos). Com o
  agrupamento por quadro e sem transições, ficou fluido; em PC muito fraco pode cair a taxa de
  quadros durante o arraste, nunca travar.
- Arquivos que pintam fundo com `style={{ background: 'var(--bg-primary)' }}` não recebem o
  degradê (o `SettingsShell` passou a usar as classes). Raios fixos em CSS próprio
  (`glass-input`, etc.) não seguem o controle de cantos.
- `prefers-reduced-transparency` não existe no Safari: lá o vidro fica como escolhido.
- Mobile (`mobile/`) segue sem temas próprios (pendência da 0040).

## Fontes

- Shopify, editor de tema (configurações de cor viram variáveis CSS para a prévia ao vivo): https://shopify.dev/docs/themes/tools/online-editor
- Live LESS Theme Customizer (prévia em iframe): https://www.virtuosoft.eu/tools/live-less-theme-customizer/
- MDN, prefers-reduced-transparency: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-transparency
- Custo do backdrop-filter em áreas grandes: https://www.sitepoint.com/create-stunning-image-effects-with-css-backdrop-filter
- WCAG 2.2, 1.4.3 e 1.4.11: https://www.w3.org/TR/WCAG22/

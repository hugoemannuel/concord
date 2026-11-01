# 0043. Aparência v3: brilho visível, efeitos animados e imagem no fundo do app, mais fontes

- Status: aceito
- Data: 2026-11-01
- Complementa: [0040](0040-aparencia-personalizada.md) e [0041](0041-aparencia-v2.md)

## Contexto

Retorno do dono sobre a v2: ligou "Brilho de fundo" (verde, 100%) e não viu diferença; quer
mais fontes, os efeitos animados do cartão de perfil no fundo do app e uma imagem de fundo
(pendência da 0040), sem perder a leitura. Forças: o contraste AA continua garantido para
qualquer escolha; nada pode pesar (efeito animado atrás de um app com centenas de elementos);
temas salvos pela v1/v2 abrem iguais; sem dependência nova.

**Causa do brilho invisível:** as bolhas ficam atrás de tudo (`Background`, `-z-10`) e, com o
vidro em 0 (o padrão de um tema novo), os painéis eram 100% opacos e as cobriam por inteiro.
Mesmo com vidro 40 os painéis ficavam 82–88% opacos, as bolhas estavam a 20–35% e uma vinheta
preta de 85% escurecia as bordas: o brilho somava ~4% de cor no chat.

## Opções consideradas

Brilho e efeitos visíveis:

1. **Desenhar por cima do conteúdo** com opacidade baixa e `mix-blend-mode`. Tinge o texto e
   derruba o contraste; quebra "nunca atrapalha a leitura".
2. **Exigir vidro** (ligar um mínimo automaticamente). Junta duas coisas diferentes: o vidro
   também desfoca, e desfocar painéis grandes sobre um canvas animado redesfoca a cada quadro.
3. **O fundo escolhido abre os painéis** (opacidade própria por painel, separada do desfoque) e
   a paleta mede o texto contra o pior caso do que fica atrás.

Efeito no fundo: (a) motor novo; (b) **o mesmo motor do cartão de perfil**
(`features/profile/lib/effects` + partículas CSS), atrás do conteúdo.

Imagem: (i) URL livre; (ii) **upload pela infraestrutura existente** (o mesmo
`user.ProfileHandler.UploadImage` do avatar e do ícone de servidor) numa pasta própria.

Fontes: (A) Google Fonts em tempo real (o app não usa; CSP e offline); (B) pacotes npm novos
(Atkinson Hyperlegible, Lexend...); (C) **os pacotes `@fontsource` OFL que o app já embute
para o estilo de nome**, com mais um peso.

## Decisão

Opção 3, (b), (ii) e (C). Nativo (Rust) não traz ganho: é CSS e canvas 2D que o renderer já
faz, e o motor de efeitos já pausa sozinho.

- **Painéis abertos pelo fundo** (`lib/paletteSurfaces.ts`): brilho (pela intensidade), efeito
  ou imagem deixam os painéis translúcidos sem desfoque (`SEE_THROUGH`; mais abertos com
  imagem). A opacidade de cada painel ainda sobe sozinha (`readableAlpha`, de 5 em 5%) até o
  texto extremo passar 6:1 sobre o pior fundo: tema claro com partícula escura ou foto escura
  atrás fica mais opaco. Nos temas próprios as bolhas vão a 50–80% e a vinheta à metade
  (`assets/themeDecor.css`); cores de bolha muito claras escurecem até luminância 0,4.
- **Contraste**: o que fica atrás entra na lista de fundos reais da paleta: as bolhas no pico
  (`GLOW_PEAK`), o efeito como branco e preto puros a 70% (`EFFECT_PEAK`, a opacidade da
  camada) e a imagem como branco e preto puros sob o véu. O véu da imagem é escuro no tema
  escuro e claro no claro, com mínimo de 35% (`MIN_IMAGE_DIM`). Testes com casos-limite e 60
  aleatórios v3 (`paletteBackdrop.test.ts`).
- **Efeito** (`components/ThemeBackdrop.tsx`, montado no `App`, só na janela principal): a
  camada `EffectLayer` extraída do `ProfileCardFrame` (mesmo motor, mesmos 14 efeitos e os mesmos
  controles `EffectControls`), `pointer-events: none`, atrás do conteúdo. Pausa com a janela
  oculta ou minimizada e fica parada com `prefers-reduced-motion` (já era do motor); com efeito
  ligado o desfoque do vidro desliga.
- **Imagem**: `POST /users/me/app-themes/image` (PNG/JPEG/WEBP até 10 MB; GIF recusado) grava em
  `UPLOADS_DIR/app-theme-images` e devolve `/api/app-theme-images/<uuid>`, servida sem token como
  o avatar (nome imprevisível, cache imutável). O app reduz para no máximo 2560×1440 antes de
  enviar. O tema guarda só essa URL (validada no Go e no cliente: nada de URL de fora nem texto
  que escape do `url()`). A imagem vira a camada `--app-image` da janela atrás dos painéis, com
  o véu em degradê por cima e desfoque opcional (camada parada). `ImageJanitor` apaga, a cada
  hora, arquivos com mais de 24 h que nenhum tema usa (editor cancelado, imagem trocada, tema
  apagado, conta excluída).
- **Fontes**: 12 opções (eram 4): Padrão, Do sistema, Montserrat, Comfortaa, Fredoka, Oswald,
  Serifada, Bitter, Zilla Slab, Monoespaçada, JetBrains Mono, Space Mono
  (`lib/themeFonts.ts`). `assets/themeFonts.css` importa só o subset latin, dois pesos por
  família (~15–25 KB cada arquivo; ~11 arquivos novos no pacote, os outros já vinham com o
  estilo de nome). `@font-face` não baixa nada sozinho: só a fonte em uso (e, com a seção
  aberta, as dos chips, cada uma escrita nela mesma). Licenças OFL já vão no build
  (`vite.renderer.shared.ts`, `NAME_FONT_PACKAGES`).
- **Formato**: campos novos opcionais (`effect`, `effectDensity`, `effectSpeed`,
  `effectColor`, `image`, `imageDim`, `imageBlur`); tema antigo ganha "sem efeito, sem imagem".
  O Go valida e completa (`internal/apptheme/backdrop.go`); sem migration (JSONB).
- **Editor**: todas as seções começam recolhidas; seções novas "Efeitos" e "Imagem de fundo";
  textos do brilho e do vidro reescritos dizendo o que mudam na tela; "Vermelho e branco" virou
  "Branco e vermelho"; os chips quebram linha em vez de cortar. As Configurações ficam sempre
  opacas num tema próprio (`.settings-shell`), senão o chat aparecia atrás do texto delas.

## Consequências

- Brilho, efeito ou imagem deixam os painéis translúcidos mesmo sem vidro: o tema muda de cara
  (é o que o dono pediu). Num tema claro com fundo escuro atrás, a paleta pode deixar um painel
  quase opaco para manter o AA.
- Efeito animado custa um canvas em tela cheia a ~30 fps (ou spans animados em CSS); a cena
  foi feita para o cartão, então no fundo fica mais espaçada (a "Quantidade" compensa).
- Imagem enviada e nunca salva fica até 24 h no disco. A imagem é pública para quem tiver a URL,
  como o avatar.
- O overlay de jogo não desenha o efeito nem a imagem (não monta o `App`).
- Mobile (`mobile/`) segue sem temas próprios (pendência da 0040).

## Fontes

- MDN, `@font-face` (o arquivo só é baixado quando a fonte é usada): https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face
- Fontsource, pacotes OFL auto-hospedados: https://fontsource.org/docs/getting-started/introduction
- WCAG 2.2, 1.4.3 Contraste (mínimo): https://www.w3.org/TR/WCAG22/
- Discord, Nitro: temas de cor e fundo do app (painéis translúcidos sobre o fundo): https://support.discord.com/hc/en-us/articles/4935609368471

# 0054. Mais efeitos e ajustes de efeito sem mexer em cada cena

- Status: aceito
- Data: 2026-11-03
- Complementa: [0043](0043-aparencia-v3.md)

## Contexto

O dono pediu mais efeitos e mais configurações: tamanho, direção, opacidade, mistura de cor
(duas cores, arco-íris), área (cartão inteiro ou só o banner) e brilho, no cartão de perfil e no
fundo do app. Forças: são 25 cenas de canvas e 3 de CSS, e reescrever cada uma para cada opção
multiplica o trabalho e os testes; tema salvo precisa desenhar igual; o orçamento é o do motor atual
(30 fps, dpr ≤ 1,5, tetos de elementos), e o fundo do app cobre a tela inteira; app antigo não pode
quebrar; sem dependência nova.

## Opções consideradas

Tamanho e direção:

1. **Cada cena lê `size` e `direction`.** Controle fino, mas toca todas as cenas e o app Android.
2. **Transformar o contexto antes do desenho** (`effects/view.ts`): a cena vive num "mundo" do
   tamanho que couber e não sabe que foi girada nem ampliada.

Mistura de cor:

1. **Cada cena pinta por elemento.** Mais bonito em algumas, mas exige paleta em todas.
2. **Pintar por cima só o que já foi desenhado**, com `source-atop`, num passo depois da cena
   (`effects/postFx.ts`). Uma linha de custo por quadro e vale para qualquer cena.

Brilho:

1. **`shadowBlur`**: conhecido por ser caro, ainda mais em tela grande.
2. **`filter: drop-shadow` na camada**: refaz o filtro a cada quadro de um canvas animado.
3. **Reduzir o quadro numa tela pequena e somar ampliado** (`lighter`): o bilinear da ampliação
   já é o desfoque; o custo é de duas cópias.

Onde guardar: coluna nova com migration, ou **a coluna JSONB que já guarda os extras do perfil e o
JSON dos temas** (nenhuma migration).

## Decisão

Transformar o contexto, pintar com `source-atop`, somar a tela pequena, e guardar no que já existe.
Nativo (Rust) não traz ganho: é canvas 2D no renderer, a mesma conclusão da 0043.

- **Compatibilidade**: sem ajuste, `viewScene` devolve a própria cena e `createPostFx` devolve null,
  então um tema salvo faz exatamente os mesmos passos de antes (`mount.test.ts` compara). Os campos
  são opcionais, zero = padrão, e o backend confere valores e faixas.
- **Cada efeito expõe só o que faz sentido** (`effectCatalog.ts`). Meia-volta é espelho, não
  rotação, para a figura não ficar deitada; por isso Dinheiro não tem "para cima" (o cifrão sairia
  invertido) e Corações e Matrix não têm direção.
- **Área**: `:has()` acompanha a altura real do banner (64 ou 106 px); no fundo do app, "só o
  topo" é 32% da janela.
- **Orçamento**: as cenas novas usam os mesmos tetos (nada passa de 160 elementos, tela cheia
  inclusive). Com mistura ou brilho, acima de 1,2 MP o quadro sai em dpr 1, porque os dois passos
  são a tela inteira. A opacidade só baixa da camada do fundo, então o pior caso de contraste
  medido pela paleta (`EFFECT_PEAK`) continua valendo.
- **App Android**: as 15 cenas novas foram copiadas (mesmo `Ctx`, que o Skia implementa). Os ajustes
  ele só guarda e devolve; não desenha nem edita.

Consequências: a mistura achata um pouco o sombreado da cena (por isso 90% de opacidade, não 100%);
a medida de custo feita aqui é sintética, em render por software e com a máquina carregada.

## Fontes

- [MDN: `globalCompositeOperation`](https://developer.mozilla.org/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation) (`source-atop`, `lighter`)
- [Chromium: `drawImage` reduzindo com mipmap](https://codereview.chromium.org/1176073003)
- [Khronos: nível menor de mip como desfoque barato](https://community.khronos.org/t/glow-texture-scale-bias-blur-on-old-hardware/56847)
- [Custo de sombra em canvas](https://www.oreilly.com/library/view/professional-html5-mobile/9781118421444/c15-anchor-9.html)

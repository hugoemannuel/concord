# ADRs (Architecture Decision Records)

Uma decisão de arquitetura por arquivo, numerada: `NNNN-titulo-curto.md`. Um ADR
não é editado depois de aceito; se a decisão mudar, escreva um novo que
**substitui** o antigo e marque o antigo como "Substituído por NNNN".

Quando escrever: ao escolher um padrão novo para uma feature, adicionar uma
dependência, criar uma pasta/camada nova ou fugir do padrão de
[docs/ai/arquitetura.md](../ai/arquitetura.md). Quando a feature só segue o
padrão existente, não precisa.

## Modelo

```markdown
# NNNN. Título no imperativo (ex.: Usar máquina de estados no fluxo de chamada)

- Status: proposto | aceito | substituído por NNNN
- Data: AAAA-MM-DD

## Contexto
O problema e as forças em jogo (o que muda junto, o que precisa escalar,
testabilidade, restrições do repo).

## Opções consideradas
1. Opção A: como resolveria, prós e contras.
2. Opção B: ...
3. Seguir o padrão atual do repo: ...

## Decisão
A escolhida e por quê (em 2–5 frases).

## Consequências
O que fica mais fácil, o que fica mais difícil, o que precisa ser feito depois.

## Fontes
- Links das referências pesquisadas.
```

## Índice

- [0001. Organizar o código por feature e infraestrutura em platform/](0001-estrutura-por-feature.md)
- [0002. Guardar o som de entrada no perfil e tocá-lo por um ouvinte do WS](0002-som-de-entrada.md)
- [0003. Reaproveitar as mensagens de canal para o chat do canal de voz](0003-chat-do-canal-de-voz.md)
- [0004. Desenhar o overlay de jogo numa janela nativa do helper no Windows](0004-overlay-nativo.md)
- [0005. Rodar o DSP do voice mod em Rust/WASM, com o .wasm commitado](0005-dsp-de-audio-em-wasm.md)
- [0006. Detectar a música tocando pelas sessões de mídia do sistema, sem dependência nova](0006-musica-em-atividade.md)
- [0007. Navegar no celular uma coluna por vez, com o painel decidido pela rota](0007-navegacao-mobile-uma-coluna.md)
- [0008. Salvar o perfil no "Aplicar" de cada editor, sem rascunho nem barra de alterações](0008-perfil-salva-no-aplicar.md)
- [0009. Tratar o dono como nível interno, sem cargos padrão além do @everyone](0009-dono-nao-e-cargo.md)
- [0010. Detectar AFK em call pelo aviso de fala do app, com o AFK filtrando as fotos das calls](0010-afk-em-call.md)
- [0011. Guardar perfis salvos com a mídia por referência, apagando o arquivo só quando ninguém mais usa](0011-perfis-salvos-midia-por-referencia.md)
- [0012. Falar as mensagens /tts no app de cada um (Web Speech), decidindo no cliente quem ouve](0012-tts-no-cliente.md)
- [0013. Mesa de áudio por servidor, com favoritos da pessoa valendo em qualquer servidor](0013-mesa-de-audio-por-servidor.md)
- [0014. No app desktop do Linux, falar o /tts com o Piper baixado no primeiro uso](0014-voz-piper-no-linux.md)
- [0015. Publicar a tela (lives) em H.264, com VP8 de reserva](0015-lives-em-h264.md)
- [0016. Dar nível ao servidor pelo que acontece nele, com teto diário por pessoa e só contas reais](0016-nivel-do-servidor.md)
- [0017. Convidar visitante para uma call com acesso escopado ao canal de voz, sem virar membro](0017-visitante-na-call.md)
- [0018. Quem está na call segue a sala de mídia (LiveKit), não só o WebSocket](0018-presenca-na-midia.md)
- [0019. O Maestro grava onde cada player estava e volta sozinho depois de o servidor reiniciar](0019-maestro-retoma-apos-reinicio.md)
- [0020. Qualidade das lives: presets com piso de 720p30, controlador próprio e vídeo na placa de vídeo](0020-qualidade-das-lives.md)
- [0021. Criar o app mobile em `mobile/` com Expo, Expo Router e Zustand](0021-app-mobile-expo.md)
- [0022. Enviar o push do app mobile direto pelo FCM, com o JWT da biblioteca padrão](0022-push-direto-pelo-fcm.md)
- [0023. Voz no app mobile com o SDK do LiveKit, atrás de uma porta `CallMedia`](0023-voz-no-app-mobile.md)
- [0024. Desenhar efeitos e recortar imagens do perfil no app mobile com o Skia](0024-skia-e-midia-no-perfil-mobile.md)
- [0025. Sons da chamada e reprodução de áudio no app mobile com o `expo-audio`](0025-sons-e-midia-no-app-mobile.md)
- [0026. Enviar anexos no app mobile com `expo-image-picker` e `expo-document-picker`](0026-anexos-no-app-mobile.md)
- [0027. Transmitir e assistir tela no app mobile (MediaProjection e assinatura sob demanda)](0027-transmissao-de-tela-no-app-mobile.md)
- [0028. Servir os instaladores do app pela GitHub Release, com os manifestos na VPS](0028-atualizacoes-pelo-github-releases.md)
- [0029. Observar as lives pelo próprio backend: Prometheus do LiveKit e telemetria do app no Postgres](0029-observabilidade-das-lives.md)
- [0030. Manter a chamada do app mobile em segundo plano com um serviço em primeiro plano (`@notifee/react-native`)](0030-servico-em-primeiro-plano-da-chamada-no-app-mobile.md)
- [0031. Transmitir a tela pelo helper Rust com o SDK Rust do LiveKit (marco 1, Linux)](0031-live-pelo-helper-rust.md)
- [0032. Sinais de qualidade das lives e calls: só o que leva a uma ação](0032-sinais-de-qualidade-das-lives-e-calls.md)
- [0033. Achar a faixa do "Ouvir também" no servidor, com APIs públicas e cache em memória](0033-links-diretos-do-ouvir-tambem.md)
- [0034. GIFs favoritos guardados no backend, por usuário, dentro de `internal/giphy`](0034-gifs-favoritos.md)
- [0035. Sons do app por pessoa: pacotes sintetizados no cliente, escolhas e áudio próprio no backend](0035-sons-do-app-personalizados.md)
- [0036. Registro de auditoria do servidor com gravação central depois da ação](0036-registro-de-auditoria.md)
- [0038. Excluir a própria conta apagando a linha do usuário e passando as mensagens que ficam para "Usuário removido"](0038-excluir-a-propria-conta.md)

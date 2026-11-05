# 0050. Captura da live com a janela do app coberta

- Status: aceito
- Data: 2026-11-02
- Relacionado: [0020](0020-qualidade-das-lives.md), [0031](0031-live-pelo-helper-rust.md), [0032](0032-sinais-de-qualidade-das-lives-e-calls.md)

## Contexto

Quem transmite jogo costuma ver `capture_fps` bem abaixo do alvo, com `limitation =
none`. Medido em Windows 11, RTX 3070, 1440p60, VALORANT a 165 fps, sem live nativa:

- A captura fica em **32 fps** em 720p, 1080p e 1440p: não é o custo de copiar o
  quadro. 32 fps = 31,25 ms = dois tiques do temporizador padrão de 15,625 ms.
- Com a janela do app totalmente coberta pelo jogo: 32 fps. Movendo a janela para o
  outro monitor, sem tirar o foco do jogo: 50–54 fps em segundos, e volta a 32 ao
  cobrir de novo. Reproduzido duas vezes seguidas.
- Com a janela coberta e `PROCESS_POWER_THROTTLING_IGNORE_TIMER_RESOLUTION` aplicado ao
  processo principal do Electron pelo helper: 48–50 fps, jogando, em 11 min de live.
- Contraprova com a live no ar: tirando a opção só do processo principal, 32 fps;
  devolvendo, 48–50. Tirando do renderer e do `video_capture`, nada muda (49–51).

A documentação do `timeBeginPeriod` diz que, no Windows 11, um processo com a janela
coberta pode não receber o temporizador pedido. Isso casa com os números acima, mas é a
explicação mais provável, não uma medição do temporizador do processo. Pedir para
quem usa deixar a janela visível não é opção.

`CalculateNativeWinOcclusion` e `disable-backgrounding-occluded-windows`, já desligados
(`captureSwitches`), não cuidam disso: quem decide é o Windows.

## Opções

1. **Helper Rust (escolhida).** O `concord-audio.exe`, que já vai no app, ganha o modo
   `keep-timer <pid>`, que chama `SetProcessInformation` e sai. Sem dependência nova.
2. **PowerShell no boot.** Sem compilar nada, mas adiciona cerca de 1 s em segundo plano
   e pode ser bloqueado por antivírus ou política de empresa.
3. **Pacote nativo de FFI no Electron.** Dependência nova, com binário por versão do
   Electron, para uma única chamada.
4. **Captura nativa** (marco 2 da ADR 0031). Resolve mais coisas, mas é bem maior;
   continua sendo o caminho se os 48–50 fps não bastarem.

## Decisão

No boot, só no Windows, o processo principal roda `concord-audio.exe keep-timer <pid>` uma
vez, com o próprio pid. Sem o helper, ou se ele falhar, a live segue como antes e o erro
vai para o `gpu.log`.

## Consequências

- Janela coberta deixa de derrubar a captura para 32 fps no app desktop. Quem transmite
  pelo navegador não ganha nada: quem manda ali é o navegador.
- O app pode manter o temporizador fino com a janela coberta, mesmo fora de live, enquanto
  o Chromium pedir: pode gastar um pouco mais de energia em notebook. Se pesar, aplicar só
  com a live no ar.
- A captura chega a 48–50 fps em 1440p, não a 60. O Chromium limita o intervalo a
  `max(duração da captura × 2, intervalo pedido)` em `desktop_capture_device.cc`, com a
  constante fixa e sem flag. Uma captura de ~10 ms daria esse teto, mas a duração não foi
  medida.

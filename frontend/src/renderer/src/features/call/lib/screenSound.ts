// De onde veio o som da minha live (telemetria: vai no evento codec_escolhido).
// "janela" = só o app da janela, pelo helper nativo (windowAudio.ts);
// "sistema" = a faixa do getDisplayMedia (loopback do Windows sem a Salinha, ou
// a aba/sistema no navegador); "nenhum" = live sem som. Serve para cruzar as
// queixas de "voz das pessoas duplicando" com o tipo de som da live.

export type ScreenSound = 'janela' | 'sistema' | 'nenhum'

/** Faixas criadas pelo som da janela (fora do callStore). */
const windowTracks = new WeakSet<MediaStreamTrack>()

export function markWindowAudioTrack(track: MediaStreamTrack): void {
  windowTracks.add(track)
}

export function screenSound(stream: Pick<MediaStream, 'getAudioTracks'>): ScreenSound {
  const [audio] = stream.getAudioTracks()
  if (!audio) return 'nenhum'
  return windowTracks.has(audio) ? 'janela' : 'sistema'
}

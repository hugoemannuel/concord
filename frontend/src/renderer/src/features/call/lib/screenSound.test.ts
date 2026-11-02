import { describe, expect, it } from 'vitest'
import { markWindowAudioTrack, screenSound } from './screenSound'

const track = (): MediaStreamTrack => ({ kind: 'audio' }) as MediaStreamTrack
const stream = (...audio: MediaStreamTrack[]): Pick<MediaStream, 'getAudioTracks'> => ({
  getAudioTracks: () => audio
})

// Que som foi junto da live (telemetria, sintoma "áudio das pessoas duplicando"):
// o som do sistema pode trazer de volta vozes que outro processo (mixer virtual,
// outro app de voz) toca; o da janela é só o app compartilhado.
describe('screenSound', () => {
  it('sem faixa de som: nenhum', () => {
    expect(screenSound(stream())).toBe('nenhum')
  })

  it('faixa do helper da janela: janela', () => {
    const fromWindow = track()
    markWindowAudioTrack(fromWindow)
    expect(screenSound(stream(fromWindow))).toBe('janela')
  })

  it('faixa do getDisplayMedia (loopback do Windows ou aba do navegador): sistema', () => {
    expect(screenSound(stream(track()))).toBe('sistema')
  })
})

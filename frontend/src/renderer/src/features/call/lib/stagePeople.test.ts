import { describe, expect, it } from 'vitest'
import {
  buildCameraEntries,
  buildMeInfo,
  mosaicRest,
  musicStageNow,
  stageMode,
  stripPeople,
  watchedExtras
} from './stagePeople'

const stream = (name: string): MediaStream => ({ name }) as unknown as MediaStream
const person = (id: string): { id: string; username: string; display_name: string } => ({
  id,
  username: id,
  display_name: id.toUpperCase()
})

describe('stageMode', () => {
  const base = { musicStage: false, hasScreens: false, hasCameras: false, hasFocus: false }

  it('vídeo da música tem prioridade', () => {
    expect(stageMode({ ...base, musicStage: true, hasScreens: true, hasFocus: true })).toBe('music')
  })

  it('sem tela nem câmera é só voz', () => {
    expect(stageMode(base)).toBe('voice')
  })

  it('com vídeo: foco se há uma live em destaque, senão mosaico', () => {
    expect(stageMode({ ...base, hasScreens: true, hasFocus: true })).toBe('focus')
    expect(stageMode({ ...base, hasScreens: true })).toBe('mosaic')
    expect(stageMode({ ...base, hasCameras: true })).toBe('mosaic')
  })
})

describe('musicStageNow', () => {
  const now = { item: { has_video: true } }

  it('só com vídeo ligado, canal de servidor e música com vídeo', () => {
    expect(musicStageNow(true, 's1', now)).toBe(now)
    expect(musicStageNow(false, 's1', now)).toBeNull()
    expect(musicStageNow(true, undefined, now)).toBeNull()
    expect(musicStageNow(true, 's1', { item: { has_video: false } })).toBeNull()
    expect(musicStageNow(true, 's1', null)).toBeNull()
  })
})

describe('buildMeInfo', () => {
  const me = { id: 'm', username: 'eu', display_name: 'Eu Mesmo', avatar_url: 'a.png' }

  it('usa o apelido do servidor e tira o estilo do nome', () => {
    const info = buildMeInfo({ ...me, name_style: { color: 'red' } } as never, 'Apelido', 'm')
    expect(info).toMatchObject({ id: 'm', display_name: 'Apelido', name_style: null })
  })

  it('sem apelido mantém nome, avatar e estilo', () => {
    const style = { color: 'red' }
    const info = buildMeInfo({ ...me, name_style: style } as never, undefined, 'm')
    expect(info).toMatchObject({
      display_name: 'Eu Mesmo',
      avatar_url: 'a.png',
      name_style: style
    })
  })

  it('sem usuário carregado cai nos padrões', () => {
    expect(buildMeInfo(null, undefined, 'me')).toEqual({
      id: 'me',
      username: '',
      display_name: 'Você',
      avatar_url: null,
      avatar_decoration_url: null,
      nameplate_url: null,
      name_style: undefined
    })
  })
})

describe('buildCameraEntries', () => {
  it('minha câmera primeiro, depois a de quem tem vídeo', () => {
    const mine = stream('mine')
    const ana = stream('ana')
    const cameras = buildCameraEntries('m', mine, [person('ana'), person('bia')], { ana })
    expect(cameras).toEqual([
      { userId: 'm', stream: mine },
      { userId: 'ana', stream: ana }
    ])
  })

  it('sem câmera minha nem dos outros, vazio', () => {
    expect(buildCameraEntries('m', null, [person('ana')], {})).toEqual([])
  })
})

describe('stripPeople', () => {
  const people = [person('ana'), person('bia'), person('cai')]

  it('tira quem está em cima e quem tem tela disponível', () => {
    expect(stripPeople(people, ['bia'], 'ana').map((p) => p.id)).toEqual(['cai'])
  })

  it('sem destaque só tira quem tem tela', () => {
    expect(stripPeople(people, ['bia']).map((p) => p.id)).toEqual(['ana', 'cai'])
  })
})

describe('mosaicRest', () => {
  const entry = (userId: string): { userId: string; stream: MediaStream | null } => ({
    userId,
    stream: null
  })

  it('mostra eu e os sem vídeo embaixo do mosaico', () => {
    const rest = mosaicRest([entry('ana')], [], 'm', [person('ana'), person('bia')])
    expect(rest).toMatchObject({ showMe: true, show: true })
    expect(rest.others.map((p) => p.id)).toEqual(['bia'])
  })

  it('tudo no mosaico: nada embaixo', () => {
    const rest = mosaicRest([entry('ana')], [entry('m')], 'm', [person('ana')])
    expect(rest).toMatchObject({ showMe: false, show: false, others: [] })
  })

  it('só eu no mosaico mas outros sem vídeo: mostra a faixa sem o meu tile', () => {
    const rest = mosaicRest([], [entry('m')], 'm', [person('bia')])
    expect(rest).toMatchObject({ showMe: false, show: true })
  })
})

describe('watchedExtras', () => {
  it('minha tela: sem fechar, sem áudio e sem tela cheia', () => {
    expect(watchedExtras({ userId: 'm', local: true }, () => {})).toEqual({ fullscreenable: false })
  })

  it('tela de outra pessoa: fechar, áudio e tela cheia', () => {
    const stopped: string[] = []
    const extras = watchedExtras({ userId: 'ana', local: false }, (id) => stopped.push(id))
    expect(extras.streamAudioUserId).toBe('ana')
    expect(extras.fullscreenable).toBe(true)
    extras.onClose?.()
    expect(stopped).toEqual(['ana'])
  })
})

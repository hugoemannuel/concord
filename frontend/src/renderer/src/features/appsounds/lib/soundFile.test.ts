import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../shared/api/client'
import { appSoundDurationError, appSoundFileError, appSoundSaveError, MAX_APP_SOUND_BYTES } from './soundFile'

const file = (name: string, type: string, size = 1000): File => {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

describe('appSoundFileError', () => {
  it('aceita mp3, ogg, wav e m4a até 1 MB', () => {
    expect(appSoundFileError(file('a.mp3', 'audio/mpeg'))).toBeNull()
    expect(appSoundFileError(file('a.ogg', 'audio/ogg'))).toBeNull()
    expect(appSoundFileError(file('a.wav', 'audio/wav'))).toBeNull()
    expect(appSoundFileError(file('a.m4a', 'audio/x-m4a'))).toBeNull()
    expect(appSoundFileError(file('a.m4a', ''))).toBeNull()
    expect(appSoundFileError(file('a.mp3', 'audio/mpeg', MAX_APP_SOUND_BYTES))).toBeNull()
  })

  it('recusa outro formato e arquivo grande', () => {
    expect(appSoundFileError(file('a.webm', 'audio/webm'))).toBe('Use um áudio MP3, OGG, WAV ou M4A.')
    expect(appSoundFileError(file('a.png', 'image/png'))).toBe('Use um áudio MP3, OGG, WAV ou M4A.')
    expect(appSoundFileError(file('a.mp3', 'audio/mpeg', MAX_APP_SOUND_BYTES + 1))).toBe(
      'O som pode ter até 1 MB.'
    )
  })
})

describe('appSoundDurationError', () => {
  it('entre 0,1 s e 5 s', () => {
    expect(appSoundDurationError(100)).toBeNull()
    expect(appSoundDurationError(5000)).toBeNull()
    expect(appSoundDurationError(99)).toBe('O som precisa ter entre 0,1 s e 5 s.')
    expect(appSoundDurationError(5001)).toBe('O som precisa ter entre 0,1 s e 5 s.')
    expect(appSoundDurationError(null)).toBe('O som precisa ter entre 0,1 s e 5 s.')
  })
})

describe('appSoundSaveError', () => {
  it('traduz o status do servidor; senão, uma mensagem genérica', () => {
    expect(appSoundSaveError(new ApiError(413, 'x'))).toBe('O som pode ter até 1 MB.')
    expect(appSoundSaveError(new ApiError(415, 'x'))).toBe('Use um áudio MP3, OGG, WAV ou M4A.')
    expect(appSoundSaveError(new ApiError(507, 'x'))).toBe('O servidor está sem espaço agora. Tente mais tarde.')
    expect(appSoundSaveError(new Error('rede'))).toBe('Não foi possível salvar o som.')
  })
})

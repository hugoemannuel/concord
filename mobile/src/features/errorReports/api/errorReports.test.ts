import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { request } from '../../../shared/api/client'
import type { ErrorReport } from '../lib/errorQueue'
import { postErrors, reportContext } from './errorReports'

jest.mock('../../../shared/api/client')

const requestMock = jest.mocked(request)

const REPORT: ErrorReport = {
  source: 'mobile',
  kind: 'TypeError',
  message: 'x',
  stack: '',
  screen: '/',
  in_call: false,
  in_live: false,
  count: 1
}

describe('errorReports api', () => {
  beforeEach(() => requestMock.mockReset().mockResolvedValue(undefined))

  it('contexto: Android com a versão do sistema, versão do app e target android', () => {
    expect(reportContext()).toEqual({
      os: `Android ${Platform.Version}`,
      app_version: Constants.expoConfig?.version ?? '0.0.0',
      target: 'android'
    })
  })

  it('postErrors manda contexto e erros no POST /obs/errors autenticado', async () => {
    const context = { os: 'Android 34', app_version: '0.1.0', target: 'android' as const }
    await postErrors([REPORT], context)
    expect(requestMock).toHaveBeenCalledWith('/obs/errors', {
      method: 'POST',
      body: JSON.stringify({ context, errors: [REPORT] })
    })
  })
})

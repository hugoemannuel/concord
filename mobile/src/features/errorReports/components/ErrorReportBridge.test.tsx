import { render } from '@testing-library/react-native'
import { useSegments } from 'expo-router'
import { setErrorScreen, startErrorReports } from '../lib/errorReportStart'
import { ErrorReportBridge } from './ErrorReportBridge'

jest.mock('expo-router', () => ({ useSegments: jest.fn() }))
jest.mock('../lib/errorReportStart', () => ({ setErrorScreen: jest.fn(), startErrorReports: jest.fn() }))

describe('ErrorReportBridge', () => {
  it('liga o relatório uma vez e guarda a tela pelo padrão da rota', async () => {
    jest.mocked(useSegments).mockReturnValue(['(app)', 'canal', '[channelId]'] as never)
    const view = await render(<ErrorReportBridge />)
    jest.mocked(useSegments).mockReturnValue(['(app)', 'dm', '[conversationId]'] as never)
    await view.rerender(<ErrorReportBridge />)
    expect(startErrorReports).toHaveBeenCalledTimes(1)
    expect(setErrorScreen).toHaveBeenNthCalledWith(1, '/canal/:channelId')
    expect(setErrorScreen).toHaveBeenLastCalledWith('/dm/:conversationId')
  })
})

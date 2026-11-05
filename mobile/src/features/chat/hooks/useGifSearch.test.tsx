import { act, renderHook } from '@testing-library/react-native'
import { fetchTrendingGifs, searchGifs } from '../api/gifs'
import { useGifSearch } from './useGifSearch'

jest.mock('../api/gifs', () => ({ fetchTrendingGifs: jest.fn(), searchGifs: jest.fn() }))
const gif = { id: 'g1', title: 'x', url: 'u', preview_url: 'p', width: 1, height: 1 }

describe('useGifSearch', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    jest.mocked(fetchTrendingGifs).mockResolvedValue([gif])
    jest.mocked(searchGifs).mockResolvedValue([{ ...gif, id: 'g2' }])
  })
  afterEach(() => jest.useRealTimers())

  it('desligado não busca', async () => {
    await renderHook(() => useGifSearch(false, ''))
    await act(async () => void jest.advanceTimersByTime(500))
    expect(fetchTrendingGifs).not.toHaveBeenCalled()
  })

  it('sem busca traz os em alta, depois de 250 ms', async () => {
    const { result } = await renderHook(() => useGifSearch(true, ''))
    expect(result.current.loading).toBe(true)
    await act(async () => void jest.advanceTimersByTime(250))
    expect(result.current.gifs.map((g) => g.id)).toEqual(['g1'])
    expect(result.current.loading).toBe(false)
  })

  it('com busca usa a busca da KLIPY; erro vira lista vazia e "indisponível"', async () => {
    const { result, rerender } = await renderHook(({ q }: { q: string }) => useGifSearch(true, q), { initialProps: { q: 'gato' } })
    await act(async () => void jest.advanceTimersByTime(250))
    expect(searchGifs).toHaveBeenCalledWith('gato')
    expect(result.current.gifs.map((g) => g.id)).toEqual(['g2'])
    expect(result.current.unavailable).toBe(false)
    jest.mocked(searchGifs).mockRejectedValue(new Error('x'))
    await rerender({ q: 'cão' })
    await act(async () => void jest.advanceTimersByTime(250))
    expect(result.current.gifs).toEqual([])
    expect(result.current.unavailable).toBe(true)
  })
})

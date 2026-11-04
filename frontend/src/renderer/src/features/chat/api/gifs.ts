import { ApiError, request } from '../../../shared/api/client'
import { klipyUrl, mapKlipyItems, type GifsConfig, type KlipyResponse } from '../lib/klipy'

export interface GifItem {
  id: string
  title: string
  url: string
  preview_url: string
  width: number
  height: number
  /** "klipy" ou "giphy" (favoritos antigos); ausente nos GIFs de mensagens. */
  provider?: string
}

/** A aba de GIFs não tem como buscar (sem chave no servidor ou a KLIPY falhou). */
export class GifsUnavailableError extends Error {
  constructor() {
    super('GIFs indisponíveis')
  }
}

let configPromise: Promise<GifsConfig> | null = null

/**
 * Chave e customer_id anônimo, vindos do servidor (GET /gifs/config). Só o
 * sucesso fica guardado; falha tenta de novo na próxima busca.
 */
export function loadGifsConfig(): Promise<GifsConfig> {
  configPromise ??= request<GifsConfig>('/gifs/config').catch((err: unknown) => {
    configPromise = null
    throw err instanceof ApiError && err.status === 503 ? new GifsUnavailableError() : err
  })
  return configPromise
}

/** Só para os testes: esquece a configuração guardada. */
export function resetGifsConfig(): void {
  configPromise = null
}

/**
 * Busca direto na KLIPY, do app (a KLIPY exige que o pedido saia de quem usa:
 * nada passa pelo nosso servidor). Sem o token da Salinha, só com a chave dela.
 */
async function fetchKlipy(limit: number, offset: number, q = ''): Promise<GifItem[]> {
  const config = await loadGifsConfig()
  const res = await fetch(klipyUrl(config, limit, offset, q)).catch(() => null)
  if (!res?.ok) throw new GifsUnavailableError()
  const body = (await res.json().catch(() => ({ result: false }))) as KlipyResponse
  if (body.result === false) throw new GifsUnavailableError()
  return mapKlipyItems(body)
}

export function fetchTrendingGifs(limit = 25, offset = 0): Promise<GifItem[]> {
  return fetchKlipy(limit, offset)
}

export function searchGifs(queryText: string, limit = 25, offset = 0): Promise<GifItem[]> {
  return fetchKlipy(limit, offset, queryText)
}

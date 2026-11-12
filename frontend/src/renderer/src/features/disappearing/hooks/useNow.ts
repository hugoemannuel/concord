import { useEffect, useState } from 'react'

/** Relógio que se atualiza a cada `intervalMs`: faz textos como "Some em X" andarem sozinhos. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

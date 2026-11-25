// Id de cada sessão da telemetria: UUID v4, como o backend exige. O Hermes não garante crypto.randomUUID; não é
// segredo nenhum (só separa as sessões), então Math.random basta. Puro.

export function newSessionId(random: () => number = Math.random): string {
  const hex = (n: number): string =>
    Array.from({ length: n }, () =>
      Math.floor(random() * 16)
        .toString(16)
        .slice(-1)
    ).join('')
  const variant = '89ab'[Math.floor(random() * 4) % 4]
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`
}

/** Teclas que revelam o spoiler focado (como um botão). */
export function isRevealKey(key: string): boolean {
  return key === 'Enter' || key === ' '
}

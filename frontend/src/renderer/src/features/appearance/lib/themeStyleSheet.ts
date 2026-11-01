// Um <style> no <head> com o CSS dos temas próprios (o gerado por themeCss.ts).
// Cada uso tem o seu id: a lista salva e a prévia do editor.

export const SAVED_THEMES_STYLE = 'salinha-custom-themes'
export const DRAFT_THEME_STYLE = 'salinha-custom-theme-draft'

export function writeStyleSheet(id: string, css: string): void {
  if (typeof document === 'undefined') return
  let el = document.getElementById(id)
  if (!el) {
    el = document.createElement('style')
    el.id = id
    document.head.appendChild(el)
  }
  if (el.textContent !== css) el.textContent = css
}

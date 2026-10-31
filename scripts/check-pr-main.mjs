// Confere um PR para a main (docs/ai/release-e-hotfix.md): só `release:` (de
// develop) ou `hotfix:` (de hotfix/<slug>). O workflow pr-main.yml chama isto
// com o título e a branch de origem em PR_TITLE e PR_HEAD.
//
//   PR_TITLE="release: x" PR_HEAD=develop node scripts/check-pr-main.mjs

const TITLE = /^(release|hotfix): \S/
const KIND = /^(release|hotfix):/
const HOTFIX_HEAD = /^hotfix\/.+/

/** Devolve a lista de erros do PR (vazia = tudo certo). */
export function checkPrMain({ title = '', head = '' }) {
  if (!TITLE.test(title)) {
    return [
      `título "${title}" não serve para a main: use "release: <resumo>" (de develop) ` +
        `ou "hotfix: <resumo>" (de hotfix/<slug>). Veja docs/ai/release-e-hotfix.md`
    ]
  }
  const kind = KIND.exec(title)[1]
  if (kind === 'release' && head !== 'develop') {
    return [`release sai da develop, mas a origem é "${head}"`]
  }
  if (kind === 'hotfix' && !HOTFIX_HEAD.test(head)) {
    return [`hotfix sai de hotfix/<slug>, mas a origem é "${head}"`]
  }
  return []
}

if (process.argv[1]?.endsWith('check-pr-main.mjs')) {
  const errors = checkPrMain({ title: process.env.PR_TITLE, head: process.env.PR_HEAD })
  for (const e of errors) console.error(`::error::${e}`)
  if (errors.length > 0) process.exit(1)
  console.log('PR para a main ok')
}

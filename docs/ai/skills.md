# Skills dos agentes

Skills são instruções carregadas sob demanda (só quando a tarefa pede), então
não pesam no contexto de toda conversa. No Claude Code elas aparecem sozinhas;
outros agentes podem ler o `SKILL.md` como documentação.

## Comandos do repo (o fluxo completo)

| Comando | Quando | Procedimento |
|---|---|---|
| `/ideia <texto>` | ideia vaga → spec aprovada | [pipeline-ideia.md](pipeline-ideia.md) |
| `/feature <spec ou descrição>` | spec → PR | [pipeline-feature.md](pipeline-feature.md) |
| `/bugfix <sintoma>` | bug → PR com teste de regressão | [pipeline-bugfix.md](pipeline-bugfix.md) |
| `/servidor-proprio` | montar o servidor próprio de alguém (leigo), do zero | [servidor-proprio.md](servidor-proprio.md) |

Claude: `.claude/skills/{ideia,feature,bugfix,servidor-proprio}/`. Gemini CLI: `.gemini/commands/*.toml`.

## Superpowers (plugin vinculado ao projeto)

Processo: brainstorming, planos, TDD, debugging sistemático, verificação,
code review, worktrees. Fonte: [obra/superpowers](https://github.com/obra/superpowers).

- **Claude Code**: já vinculado. O [.claude/settings.json](../../.claude/settings.json)
  declara o marketplace `obra/superpowers-marketplace` e habilita
  `superpowers@superpowers-marketplace`; ao abrir o repo e confiar na pasta, o
  Claude Code pede para instalar. Se não aparecer:
  ```
  /plugin marketplace add obra/superpowers-marketplace
  /plugin install superpowers@superpowers-marketplace
  ```
- **Gemini CLI**: `gemini extensions install https://github.com/obra/superpowers`
  (as skills ficam com os mesmos nomes).
- **Codex**: `/plugins` → buscar "superpowers" (marketplace oficial do Codex).
- Sem o plugin, os pipelines continuam valendo: cada passo tem o resumo do
  que a skill faria.

| Skill | Usada em |
|---|---|
| `superpowers:brainstorming` | `/ideia` |
| `superpowers:writing-plans` | `/feature` |
| `superpowers:using-git-worktrees` | `/feature`, `/bugfix` |
| `superpowers:test-driven-development` | `/feature`, `/bugfix` |
| `superpowers:subagent-driven-development` / `executing-plans` | `/feature` |
| `superpowers:systematic-debugging` | `/bugfix` (e qualquer teste falhando sem motivo claro) |
| `superpowers:verification-before-completion` | antes de dizer "pronto" |
| `superpowers:requesting-code-review` / `receiving-code-review` | antes do PR |
| `superpowers:finishing-a-development-branch` | PR |

## Skills de terceiros copiadas no repo (`.claude/skills/`)

Copiadas (e não instaladas da internet) para ficarem fixas, revisadas e iguais
para todo mundo. Em todas foi tirado o `allowed-tools`, que pré-aprovava comandos
como `git` sem perguntar, e foi colocada no topo uma nota **Concord** com o que
muda neste repo. A nota e o AGENTS.md prevalecem sobre o resto da skill.

| Skill | Para quê | Origem (commit) | Licença |
|---|---|---|---|
| [golang-testing](../../.claude/skills/golang-testing/SKILL.md) | testes Go: tabela, fuzz, `synctest`, integração | samber/cc-skills-golang `246b6c4` | MIT |
| [golang-concurrency](../../.claude/skills/golang-concurrency/SKILL.md) | goroutines, canais, mutex, vazamentos | samber/cc-skills-golang `246b6c4` | MIT |
| [golang-security](../../.claude/skills/golang-security/SKILL.md) | injeção, path traversal, segredos, SSRF | samber/cc-skills-golang `246b6c4` | MIT |
| [golang-refactoring](../../.claude/skills/golang-refactoring/SKILL.md) | refatoração segura (extrair, mover, quebrar ciclos) | samber/cc-skills-golang `246b6c4` | MIT |
| [react-best-practices](../../.claude/skills/react-best-practices/SKILL.md) | desempenho React (re-render, bundle, waterfalls) | vercel-labs/agent-skills `063bee9` | MIT |
| [composition-patterns](../../.claude/skills/composition-patterns/SKILL.md) | componentes sem props booleanas demais (anti-god no React) | vercel-labs/agent-skills `063bee9` | MIT |
| [web-design-guidelines](../../.claude/skills/web-design-guidelines/SKILL.md) | revisão de UI: acessibilidade, foco, formulários, layout | vercel-labs/web-interface-guidelines `434b7f9` | MIT |

Avaliadas e **não** incluídas:

- `anthropics/skills@webapp-testing`: usa Playwright em Python. O repo usa
  Playwright em Node (`scripts/e2e-*.mjs`).
- `anthropics/skills@frontend-design`: voltada a páginas novas com identidade
  própria, o que conflita com seguir o design system do app (`assets/main.css`).
- `samber/cc-skills-golang@golang-error-handling`: centrada em `samber/oops`,
  uma dependência que o repo não usa.

Para atualizar uma skill copiada: clone a origem numa pasta temporária, compare,
leia a diferença inteira (é conteúdo de terceiros que o agente vai seguir),
copie, reaplique a nota Concord, tire o `allowed-tools` e atualize o commit
nesta tabela.

## Embutidas no Claude Code

- `/code-review`: revisão do diff atual num subagente.
- `/security-review`: revisão de segurança do diff.

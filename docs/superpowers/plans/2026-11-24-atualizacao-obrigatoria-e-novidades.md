# Plano: atualização obrigatória e modal de novidades

Spec: [2026-11-24-atualizacao-obrigatoria-e-novidades-design.md](../specs/2026-11-24-atualizacao-obrigatoria-e-novidades-design.md)

Cada tarefa: teste falhando primeiro, código mínimo, `node scripts/affected-tests.mjs loop`.

0. **Estrutural**: o changelog sai do `wireEngagement` para `cmd/wire_changelog.go` (o main já
   tem `compareVersions` em `updates/linuxInstall.ts`; nada a mover no front).
1. **Script**: `parseNotes` lê o cabeçalho (`obrigatoria`, `destaque`), marca `required` e
   `highlight` nas notas; erros para chave desconhecida, valor inválido e obrigatória sem nota.
   `scripts/publish-changelog.test.mjs`. README de `changelog/pending/`.
2. **Backend**: migration 000209; `Entry.Highlight`/`Entry.Required`, `Release.Required`;
   `publish` marca a release pela notas novas; `requiredVersion(releases)`; rota pública
   `GET /changelog/required`; `onPublish` → `hub.BroadcastAll(changelog:update)`.
3. **Renderer, lógica pura**: `lib/requiredUpdate.ts` (`mustUpdate`, status do botão),
   `lib/whatsNew.ts` (destaques entre a vista e a atual), `lib/releaseGate.ts` (qual modal
   mostrar, qual versão gravar como vista), `lib/seenVersion.ts` (localStorage).
4. **Renderer, store**: `store/releaseGateStore.ts` (versão mínima, instalada, releases,
   `refresh`); `changelog:update` no `wsEvents/delegates.ts` chama `refresh`.
5. **Renderer, UI**: `components/RequiredUpdateModal.tsx`, `components/WhatsNewModal.tsx`,
   `components/ReleaseGate.tsx` montado no `App.tsx` (logado). Responsivo 360–1280.
6. **Main**: `updates/requiredVersion.ts` (busca a mínima com prazo); `startupFlow` com
   `mandatory` (sem "Abrir sem atualizar"); `startupSplash` repassa; `index.ts` liga.
7. **Pré-PR**: `affected-tests pr`, CRAP, revisão, PR para `develop`.

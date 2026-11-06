import { errorMessage } from '../../../shared/lib/errorMessage'
import type { CreatePollInput } from '../api/messages'
import { pollDraftToInput, type PollDraft } from './polls'

/** O que publicar a enquete usa de fora (criar, fechar o modal e aviso). */
export interface PollSubmitDeps {
  create: (input: CreatePollInput) => Promise<void>
  done: () => void
  error: (message: string) => void
}

/** Publica o rascunho; fecha se deu certo, avisa se falhou. */
export async function submitPoll(deps: PollSubmitDeps, draft: PollDraft): Promise<void> {
  try {
    await deps.create(pollDraftToInput(draft))
    deps.done()
  } catch (err) {
    deps.error(errorMessage(err, 'Falha ao criar a enquete.'))
  }
}

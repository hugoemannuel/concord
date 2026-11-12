import { errorMessage } from '../../../shared/lib/errorMessage'
import type { CreatePollInput } from '../api/messages'
import { pollDraftToInput, type PollDraft } from './polls'
import { slowmodeErrorText, slowmodeRetryAfter } from './slowmode'

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
    const retryAfter = slowmodeRetryAfter(err)
    deps.error(retryAfter !== null ? slowmodeErrorText(retryAfter) : errorMessage(err, 'Falha ao criar a enquete.'))
  }
}

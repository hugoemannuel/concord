import { useState } from 'react'
import { githubUsernameError } from '../lib/proposals'
import { useProposalStore } from '../store/proposalStore'
import { showToast } from '../../../shared/store/toastStore'
import { errorMessage } from '../../../shared/lib/errorMessage'
import Button from '../../../shared/ui/Button'
import Input from '../../../shared/ui/Input'
import Modal from '../../../shared/ui/Modal'

/**
 * Time tech: o usuário do GitHub vira o assignee da issue dos cards que a
 * pessoa pegar. Fica no topo do quadro, perto de onde ele vale.
 */
function GithubUsernameButton(): React.JSX.Element {
  const login = useProposalStore((s) => s.githubUsername)
  const save = useProposalStore((s) => s.saveGithubUsername)
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const error = githubUsernameError(value)

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (error) return
    setSaving(true)
    try {
      await save(value)
      setOpen(false)
    } catch (err) {
      showToast.error(errorMessage(err, 'Não foi possível salvar.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        onClick={() => {
          setValue(login ?? '')
          setOpen(true)
        }}
        title="Seu usuário do GitHub vira o responsável pela issue dos cards que você pegar"
      >
        {login ? `GitHub: @${login}` : 'Informar GitHub'}
      </Button>
      <Modal open={open} title="Seu usuário do GitHub" onClose={() => setOpen(false)}>
        <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
          <p className="text-sm text-gray-300">
            Quando você pegar um card, a issue dele no GitHub fica com você como responsável.
          </p>
          <Input
            label="Usuário do GitHub"
            placeholder="seu-usuario"
            autoCapitalize="none"
            spellCheck={false}
            value={value}
            error={error}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !!error}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}

export default GithubUsernameButton

import { useUpdateStore } from '../store/updateStore'

/**
 * "Atualizar agora" do modal obrigatório: baixa furando a espera e reinicia;
 * sem versão nova conhecida, pede também a checagem (o main instala ao achar).
 */
export function startRequiredUpdate(): void {
  const store = useUpdateStore.getState()
  store.install()
  if (!store.version) window.api?.updates?.checkNow()
}

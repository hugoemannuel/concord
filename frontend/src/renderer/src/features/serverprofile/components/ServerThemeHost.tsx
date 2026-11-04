import { useServerThemeEffect } from '../hooks/useServerThemeEffect'

/** Liga o fundo do servidor enquanto esta tela está aberta. */
export default function ServerThemeHost({ serverId }: { serverId: string | undefined }): null {
  useServerThemeEffect(serverId)
  return null
}

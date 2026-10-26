// "Hospedar um servidor" numa VPS: o que o assistente (pages/HostServer.tsx)
// manda ao main (hostSetup.ts) e os eventos que voltam do salinha-host deploy
// (backend/internal/hostkit: deploy.go, setup.go e events.go).

export type HostStep = 'connect' | 'download' | 'setup' | 'database' | 'https' | 'start' | 'check'

export type HostEvent =
  | {
      type: 'step'
      step: HostStep
      state: 'running' | 'done' | 'error'
      message?: string
      /** Algo não deu, mas não impede (ex.: firewall, bot de música). */
      warning?: string
    }
  | { type: 'ready'; publicUrl: string; mode: 'vps' }
  | { type: 'error'; message: string }

/** Dados da VPS digitados no assistente (a senha só vai ao salinha-host, pelo stdin). */
export interface VpsForm {
  host: string
  user: string
  auth: 'password' | 'key'
  password?: string
  keyPath?: string
  keyPassphrase?: string
  /** Domínio próprio apontado para a VPS (vazio = <ip>.sslip.io). */
  domain?: string
  autoUpdate: boolean
}

/** Mensagem do deploy quando a VPS mudou de identidade (deploy.go, connectError). */
export const HOST_KEY_CHANGED = 'a identidade desta VPS mudou'

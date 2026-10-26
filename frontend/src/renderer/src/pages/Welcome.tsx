import { Link } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import { CompassIcon, MonitorIcon } from '../components/icons'

interface ChoiceProps {
  to: string
  icon: React.ReactNode
  title: string
  description: string
}

function Choice({ to, icon, title, description }: ChoiceProps): React.JSX.Element {
  return (
    <Link
      to={to}
      className="group flex items-start gap-4 rounded-xl border border-white/10 bg-white/5 p-4 transition-all duration-200 hover:border-violet-400/40 hover:bg-violet-500/10"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#5865f2] to-[#8b5cf6] text-white shadow-md shadow-[#5865f2]/25">
        {icon}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="font-semibold text-gray-50 group-hover:text-white">{title}</span>
        <span className="text-sm text-gray-400">{description}</span>
      </span>
    </Link>
  )
}

/** Build genérico, primeira vez: entrar no servidor de alguém ou hospedar um. */
function Welcome(): React.JSX.Element {
  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold text-gray-50">Boas-vindas à Salinha!</h1>
      <p className="mb-6 mt-1 text-sm text-gray-400">Como você quer começar?</p>
      <div className="flex flex-col gap-3">
        <Choice
          to="/conectar"
          icon={<CompassIcon className="h-6 w-6" />}
          title="Entrar num servidor"
          description="Um amigo te passou o endereço do servidor da turma."
        />
        <Choice
          to="/hospedar"
          icon={<MonitorIcon className="h-6 w-6" />}
          title="Hospedar um servidor"
          description="Instala a Salinha na sua VPS. No fim você recebe o endereço para mandar aos amigos."
        />
      </div>
    </AuthLayout>
  )
}

export default Welcome

import { useState } from 'react'
import { describeTest, serverHost, testConnection } from '../api/connectionTest'
import Button from './Button'

/** Botão das telas de conta para quando o pedido nem chegou ao servidor. */
function ConnectionTest(): React.JSX.Element {
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const run = async (): Promise<void> => {
    setTesting(true)
    setResult(null)
    const outcome = await testConnection()
    setResult(describeTest(outcome, serverHost()))
    setTesting(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="ghost" className="w-full" onClick={run} disabled={testing}>
        {testing ? 'Testando...' : 'Testar conexão'}
      </Button>
      {result && <p className="text-sm text-gray-300">{result}</p>}
    </div>
  )
}

export default ConnectionTest

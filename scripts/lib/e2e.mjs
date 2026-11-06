// Ajudantes dos scripts e2e (scripts/e2e-*.mjs): cliente da API, cadastro de
// usuário com e-mail confirmado e o tom WAV que faz de microfone falso.
//
//   const { api, request, makeUser, verifyEmail } = createE2E({ api: API, run })
//
// Sem SMTP o backend escreve o e-mail no log (LogMailer): makeUser tira o link
// de confirmação de lá. Por padrão lê o arquivo de BACKEND_LOG; quem sobe o
// próprio backend passa readLog.
import { readFileSync, writeFileSync } from 'node:fs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// parseBody: JSON quando dá; senão o texto cru (página de erro do proxy etc.).
export function parseBody(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

// requestInit monta as opções do fetch: JSON, Bearer opcional e cabeçalhos extras.
export function requestInit({ token, method = 'GET', body, headers = {} } = {}) {
  return {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body == null ? undefined : JSON.stringify(body)
  }
}

// createApi: request devolve { status, ok, body } e nunca lança por status;
// api devolve só o corpo e lança quando o status é de erro.
export function createApi(base, fetchImpl = fetch) {
  async function request(path, opts = {}) {
    const res = await fetchImpl(base + path, requestInit(opts))
    const text = await res.text()
    return { status: res.status, ok: res.ok, body: parseBody(text), text }
  }
  async function api(path, opts = {}) {
    const res = await request(path, opts)
    if (!res.ok) throw new Error(`${opts.method ?? 'GET'} ${path} -> ${res.status} ${res.text}`)
    return res.body
  }
  return { api, request }
}

// verifyToken acha no log o token do último e-mail de confirmação para `email`
// (o LogMailer escreve "para <email> — <assunto>" e o texto com o link).
export function verifyToken(log, email) {
  const at = log.lastIndexOf(`para ${email} `)
  if (at < 0) return null
  const match = /\/verify-email\?token=([^\s&]+)/.exec(log.slice(at))
  return match ? decodeURIComponent(match[1]) : null
}

// logFile: leitor do log do backend; só reclama de BACKEND_LOG quando é usado.
export function logFile(path = process.env.BACKEND_LOG) {
  return () => {
    if (!path) throw new Error('defina BACKEND_LOG (saída do backend sem SMTP, onde sai o link de confirmação do e-mail)')
    return readFileSync(path, 'utf8')
  }
}

// ipSequence: um IP falso por cadastro (X-Forwarded-For). O backend limita a 5
// cadastros por IP por hora; com HOST=127.0.0.1 ele confia no loopback e cada
// cadastro conta para um IP diferente. Sem essa confiança o cabeçalho é ignorado.
export function ipSequence(prefix = `10.${randomByte()}.${randomByte()}`) {
  let n = 0
  return () => `${prefix}.${(n++ % 254) + 1}`
}

function randomByte() {
  return Math.floor(Math.random() * 256)
}

export function createE2E({
  api: base,
  run = Date.now().toString(36),
  password = 'senha-forte-123',
  readLog = logFile(),
  fetchImpl = fetch,
  retryMs = 2000
}) {
  const { api, request } = createApi(base, fetchImpl)
  const nextIp = ipSequence()

  async function verifyEmail(email, { timeoutMs = 10000, pollMs = 100 } = {}) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const token = verifyToken(readLog(), email)
      if (token) return api('/auth/verify-email', { method: 'POST', body: { token } })
      await sleep(pollMs)
    }
    throw new Error(`e-mail de confirmação de ${email} não apareceu no log do backend`)
  }

  // register tenta de novo no 429 (limite de cadastro ou bcrypt sem vaga com a máquina carregada).
  async function register(body) {
    for (let attempt = 1; ; attempt++) {
      const res = await request('/auth/register', { method: 'POST', body, headers: { 'X-Forwarded-For': nextIp() } })
      if (res.status !== 429 || attempt >= 5) {
        if (!res.ok) throw new Error(`cadastro de ${body.username}: ${res.status} ${res.text}`)
        return res.body
      }
      await sleep(retryMs)
    }
  }

  async function withMe(user) {
    const me = await api('/users/me', { token: user.token })
    return { ...me, ...user, id: me.id }
  }

  async function signUp(name, opts) {
    const user = {
      name,
      username: `${name}${run}`,
      email: `${name.toLowerCase()}-${run}@teste.dev`,
      password: opts?.password ?? password
    }
    const { username, email } = user
    const { access_token } = await register({ username, display_name: name, email, password: user.password })
    return { ...user, token: access_token }
  }

  // registerUser cadastra sem confirmar o e-mail (para testar a confirmação).
  async function registerUser(name, opts) {
    return withMe(await signUp(name, opts))
  }

  // makeUser cadastra e confirma o e-mail: o caso normal de todo e2e.
  async function makeUser(name, opts) {
    const user = await signUp(name, opts)
    await verifyEmail(user.email)
    return withMe(user)
  }

  return { api, request, verifyEmail, registerUser, makeUser }
}

// toneWav: WAV mono de 16 bits com um seno de `hz` (o microfone falso do
// Chromium). tremolo > 0 balança o volume a 3 Hz, para soar como voz.
export function toneWav({ hz = 440, seconds = 10, rate = 48000, tremolo = 0 } = {}) {
  const samples = seconds * rate
  const buf = Buffer.alloc(44 + samples * 2)
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples * 2, 4); buf.write('WAVE', 8)
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34)
  buf.write('data', 36); buf.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i++) {
    const env = 1 - tremolo + tremolo * Math.sin((2 * Math.PI * 3 * i) / rate)
    buf.writeInt16LE(Math.round(12000 * env * Math.sin((2 * Math.PI * hz * i) / rate)), 44 + i * 2)
  }
  return buf
}

export function writeToneWav(path, opts) {
  writeFileSync(path, toneWav(opts))
}

// Comprehensive E2E test for Chat, Reactions, GIFs, Server Stickers, DMs, Edits, Pins & WebSockets
// Uso: backend rodando, sem SMTP, com a saída num arquivo (o link de confirmação do e-mail sai lá):
//   API=http://localhost:8080/api BACKEND_LOG=<saída do backend> node scripts/e2e-stickers-gifs.mjs
import { strict as assert } from 'assert'
import { createE2E, parseBody } from './lib/e2e.mjs'

const API = process.env.API ?? 'http://localhost:8080/api'
const WS_URL = API.replace(/^http/, 'ws').replace(/\/api$/, '/ws')
const run = Date.now().toString(36)
const { request: api, makeUser } = createE2E({ api: API, run })

// PNG 1x1 valid image
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

async function uploadSticker(token, serverId, name, bytes, mime = 'image/png', ext = 'png') {
  const form = new FormData()
  form.append('name', name)
  form.append('file', new Blob([bytes], { type: mime }), `${name}.${ext}`)
  const res = await fetch(`${API}/servers/${serverId}/stickers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  })
  return { status: res.status, body: parseBody(await res.text()) }
}

function connectWs(token, rooms = []) {
  return new Promise((resolve, reject) => {
    const events = []
    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`)
    const timer = setTimeout(() => reject(new Error('WS connection timeout')), 5000)

    ws.addEventListener('open', () => {
      clearTimeout(timer)
      for (const room of rooms) {
        ws.send(JSON.stringify({ type: 'subscribe', payload: { room } }))
      }
      setTimeout(() => resolve({ ws, events }), 150)
    })

    ws.addEventListener('message', (ev) => {
      try {
        const parsed = JSON.parse(String(ev.data))
        events.push(parsed)
      } catch {
        // ignore non-json
      }
    })

    ws.addEventListener('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

async function waitForWsEvent(events, predicate, timeoutMs = 3000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const found = events.find(predicate)
    if (found) return found
    await new Promise((r) => setTimeout(r, 50))
  }
  return null
}

async function runTests() {
  console.log('--- INICIANDO TESTES COMPLETOS END-TO-END (E2E) ---')

  // 1. Criação de usuários Ana e Bia
  console.log('1. Criando usuários Ana e Bia...')
  const ana = await makeUser('ana')
  const bia = await makeUser('bia')
  console.log(`   Ana: ${ana.id}, Bia: ${bia.id}`)

  // 2. Ana cria um servidor e Bia entra pelo convite
  console.log('2. Ana criando servidor e Bia entrando pelo convite...')
  const srvRes = await api('/servers', {
    token: ana.token,
    method: 'POST',
    body: { name: `Servidor E2E ${run}` }
  })
  assert.equal(srvRes.status, 201, 'Servidor deve ser criado com 201')
  const serverId = srvRes.body.id ?? srvRes.body.server?.id

  const codeRes = await api(`/servers/${serverId}/invite-code`, { token: ana.token })
  assert.equal(codeRes.status, 200)
  const joinRes = await api('/invites/join', {
    token: bia.token,
    method: 'POST',
    body: { code: codeRes.body.code }
  })
  assert.equal(joinRes.status, 200, `Bia deve entrar no servidor: ${JSON.stringify(joinRes.body)}`)

  const channels = (await api(`/servers/${serverId}/channels`, { token: ana.token })).body
  const channel = channels.find((c) => (c.type ?? 'text') === 'text')
  assert.ok(channel, 'Canal de texto deve existir')
  console.log(`   Servidor: ${serverId}, Canal: ${channel.id}`)

  // Conecta WebSocket para Bia e Ana
  console.log('   Conectando WebSockets para verificar eventos em tempo real...')
  const biaWs = await connectWs(bia.token, [`channel:${channel.id}`, `server:${serverId}`])
  const anaWs = await connectWs(ana.token, [`channel:${channel.id}`, `server:${serverId}`])

  // 3. Upload e validação de Figurinha
  console.log('3. Testando upload de figurinha (validação de formato + evento WS sticker:created)...')
  const badUpload = await uploadSticker(
    ana.token,
    serverId,
    'bad_file',
    Buffer.from('not an image'),
    'text/plain',
    'txt'
  )
  assert.equal(badUpload.status, 415, `Upload inválido deve retornar 415: ${badUpload.status}`)

  const uploadRes = await uploadSticker(ana.token, serverId, 'doge_test', PNG)
  assert.equal(
    uploadRes.status,
    201,
    `Upload de figurinha deve retornar 201: ${JSON.stringify(uploadRes.body)}`
  )
  const sticker = uploadRes.body
  assert.equal(sticker.name, 'doge_test')
  assert.equal(sticker.server_id, serverId)
  assert.equal(sticker.uploader_id, ana.id)

  const wsStickerCreated = await waitForWsEvent(
    biaWs.events,
    (e) => e.type === 'sticker:created' && e.payload?.sticker?.id === sticker.id
  )
  assert.ok(wsStickerCreated, 'Bia deve receber evento WS sticker:created no formato padrão {type, payload}')
  console.log(`   Figurinha criada e recebida via WS: ID ${sticker.id} (:${sticker.name}:)`)

  // 4. Listagem e download da figurinha com media token
  console.log('4. Bia listando e baixando figurinha do servidor...')
  const listStkRes = await api(`/servers/${serverId}/stickers`, { token: bia.token })
  assert.equal(listStkRes.status, 200)
  assert.ok(listStkRes.body.some((s) => s.id === sticker.id && s.name === 'doge_test'))

  const tokenRes = await api('/media/token', { token: bia.token })
  assert.equal(tokenRes.status, 200)
  const mediaToken = tokenRes.body.token
  const fileNoToken = await fetch(`${API}/stickers/${sticker.id}/file`)
  assert.equal(fileNoToken.status, 401, 'Download sem token deve retornar 401')
  const fileRes1 = await fetch(`${API}/stickers/${sticker.id}/file?token=${mediaToken}`)
  assert.equal(fileRes1.status, 200, 'Download em /stickers/:id/file deve retornar 200')
  const fileBytes = Buffer.from(await fileRes1.arrayBuffer())
  assert.equal(fileBytes.length, PNG.length)
  console.log(`   Download da figurinha conferido (${fileBytes.length} bytes)!`)

  // 5. Envio de mensagens no canal: Texto, Figurinha e GIF (com Reply)
  console.log('5. Testando envio de mensagens de texto, figurinha, GIF e respostas (reply)...')
  const sendTextRes = await api(`/channels/${channel.id}/messages`, {
    token: ana.token,
    method: 'POST',
    body: { content: 'Olá pessoal do chat!' }
  })
  assert.equal(sendTextRes.status, 201)
  const msgText = sendTextRes.body

  const wsMsgText = await waitForWsEvent(
    biaWs.events,
    (e) => e.type === 'message:create' && e.payload?.message?.id === msgText.id
  )
  assert.ok(wsMsgText, 'Bia deve receber message:create via WS')

  const sendStkMsg = await api(`/channels/${channel.id}/messages`, {
    token: ana.token,
    method: 'POST',
    body: {
      content: '',
      sticker_id: sticker.id,
      reply_to_id: msgText.id
    }
  })
  assert.equal(sendStkMsg.status, 201, `Envio de figurinha deve retornar 201: ${JSON.stringify(sendStkMsg.body)}`)
  const msg1 = sendStkMsg.body
  assert.equal(msg1.sticker_id, sticker.id)
  assert.equal(msg1.reply_to_id, msgText.id)
  assert.equal(msg1.sticker?.name, 'doge_test')

  // Bia responde à figurinha da Ana com um GIF
  const sendGifMsg = await api(`/channels/${channel.id}/messages`, {
    token: bia.token,
    method: 'POST',
    body: {
      content: 'olha esse gif!',
      reply_to_id: msg1.id,
      gif_url: 'https://media.giphy.com/media/test/giphy.gif',
      gif_metadata: {
        width: 480,
        height: 270,
        preview_url: 'https://media.giphy.com/media/test/preview.gif'
      }
    }
  })
  assert.equal(sendGifMsg.status, 201, `Envio de GIF deve retornar 201: ${JSON.stringify(sendGifMsg.body)}`)
  const msg2 = sendGifMsg.body
  assert.equal(msg2.gif_url, 'https://media.giphy.com/media/test/giphy.gif')
  assert.equal(msg2.reply_to_id, msg1.id)
  assert.equal(msg2.gif_metadata.width, 480)

  // Validação de gif_url inválido
  const badGifMsg = await api(`/channels/${channel.id}/messages`, {
    token: bia.token,
    method: 'POST',
    body: {
      content: '',
      gif_url: 'javascript:alert(1)'
    }
  })
  assert.equal(badGifMsg.status, 400, 'gif_url sem http/https deve ser rejeitado com 400')
  console.log('   Mensagens de texto, figurinha, GIF (com reply_to_id) e validações conferidas!')

  // 6. Edição de mensagens (texto comum + limpar legenda de mensagem com GIF)
  console.log('6. Testando edição de mensagens e remoção de texto em mensagem com GIF...')
  const editRes1 = await api(`/channels/${channel.id}/messages/${msgText.id}`, {
    token: ana.token,
    method: 'PATCH',
    body: { content: 'Olá pessoal do chat (editado)!' }
  })
  assert.equal(editRes1.status, 200)
  assert.equal(editRes1.body.content, 'Olá pessoal do chat (editado)!')
  assert.ok(editRes1.body.edited_at, 'edited_at deve estar preenchido')

  const wsMsgUpdate = await waitForWsEvent(
    biaWs.events,
    (e) => e.type === 'message:update' && e.payload?.message?.id === msgText.id
  )
  assert.ok(wsMsgUpdate, 'Bia deve receber message:update via WS')

  // Bia limpa o texto da sua mensagem com GIF (deve ser permitido pois tem gif_url)
  const editGifRes = await api(`/channels/${channel.id}/messages/${msg2.id}`, {
    token: bia.token,
    method: 'PATCH',
    body: { content: '' }
  })
  assert.equal(
    editGifRes.status,
    200,
    `Limpar texto de mensagem com GIF deve retornar 200: ${JSON.stringify(editGifRes.body)}`
  )
  assert.equal(editGifRes.body.content, '')
  assert.equal(editGifRes.body.gif_url, 'https://media.giphy.com/media/test/giphy.gif')

  // Outro usuário não pode editar mensagem alheia
  const forbiddenEdit = await api(`/channels/${channel.id}/messages/${msgText.id}`, {
    token: bia.token,
    method: 'PATCH',
    body: { content: 'tentativa inválida' }
  })
  assert.equal(forbiddenEdit.status, 403)
  console.log('   Edição de mensagens (e preservação de GIF ao limpar legenda) conferida!')

  // 7. Fixar mensagens (Pins) com figurinha e GIF
  console.log('7. Testando fixação (Pin/Unpin) de mensagens com figurinha e GIF...')
  const pin1 = await api(`/channels/${channel.id}/pins/${msg1.id}`, {
    token: ana.token,
    method: 'PUT'
  })
  assert.ok(pin1.status === 200 || pin1.status === 204, 'Fixar mensagem de figurinha deve retornar 200/204')

  const pin2 = await api(`/channels/${channel.id}/pins/${msg2.id}`, {
    token: ana.token,
    method: 'PUT'
  })
  assert.ok(pin2.status === 200 || pin2.status === 204, 'Fixar mensagem de GIF deve retornar 200/204')

  const wsPinAdd = await waitForWsEvent(
    biaWs.events,
    (e) => e.type === 'channel:pin:add' && e.payload?.message?.id === msg1.id
  )
  assert.ok(wsPinAdd, 'Evento WS channel:pin:add deve ser recebido')
  assert.equal(wsPinAdd.payload?.message?.sticker?.name, 'doge_test', 'WS channel:pin:add deve trazer sticker populado')

  const pinsList = await api(`/channels/${channel.id}/pins`, { token: bia.token })
  assert.equal(pinsList.status, 200)
  const pinnedStickerMsg = pinsList.body.find((p) => p.id === msg1.id)
  const pinnedGifMsg = pinsList.body.find((p) => p.id === msg2.id)
  assert.ok(pinnedStickerMsg, 'Mensagem de figurinha deve estar nos fixados')
  assert.equal(pinnedStickerMsg.sticker?.name, 'doge_test', 'Pin deve trazer objeto sticker populado')
  assert.ok(pinnedGifMsg, 'Mensagem de GIF deve estar nos fixados')
  assert.equal(
    pinnedGifMsg.gif_url,
    'https://media.giphy.com/media/test/giphy.gif',
    'Pin deve trazer gif_url populado'
  )

  const unpin2 = await api(`/channels/${channel.id}/pins/${msg2.id}`, {
    token: ana.token,
    method: 'DELETE'
  })
  assert.ok(unpin2.status === 200 || unpin2.status === 204, 'Desafixar mensagem deve retornar 200/204')
  console.log('   Fixação de mensagens com figurinha e GIF conferida!')

  // 8. Reações com Emojis e eventos WS
  console.log('8. Testando sistema de reações com emojis e eventos em tempo real...')
  const react1 = await api(`/channels/${channel.id}/messages/${msg1.id}/reactions`, {
    token: bia.token,
    method: 'POST',
    body: { emoji: '👍' }
  })
  assert.equal(react1.status, 200)

  const wsReactAdd = await waitForWsEvent(
    anaWs.events,
    (e) =>
      e.type === 'message:reaction:add' &&
      e.payload?.message_id === msg1.id &&
      e.payload?.emoji === '👍' &&
      e.payload?.user_id === bia.id
  )
  assert.ok(wsReactAdd, 'Ana deve receber evento WS message:reaction:add')

  const react2 = await api(`/channels/${channel.id}/messages/${msg1.id}/reactions`, {
    token: ana.token,
    method: 'POST',
    body: { emoji: '👍' }
  })
  assert.equal(react2.status, 200)

  const react3 = await api(`/channels/${channel.id}/messages/${msg2.id}/reactions`, {
    token: ana.token,
    method: 'POST',
    body: { emoji: '🔥' }
  })
  assert.equal(react3.status, 200)

  // Validação de emoji inválido/vazio
  const badReact = await api(`/channels/${channel.id}/messages/${msg1.id}/reactions`, {
    token: ana.token,
    method: 'POST',
    body: { emoji: '' }
  })
  assert.equal(badReact.status, 400, 'Emoji vazio deve retornar 400')

  // 9. Consulta histórico de mensagens e confere agregação de reações
  console.log('9. Verificando listagem e agregação de reações no chat...')
  const listMsgs = await api(`/channels/${channel.id}/messages`, { token: bia.token })
  assert.equal(listMsgs.status, 200)
  const fetchedMsg1 = listMsgs.body.find((m) => m.id === msg1.id)
  assert.ok(fetchedMsg1?.reactions, 'Reações devem estar presentes')
  const thumbReaction = fetchedMsg1.reactions.find((r) => r.emoji === '👍')
  assert.equal(thumbReaction?.count, 2, 'Contagem de 👍 deve ser 2')
  assert.deepEqual(thumbReaction.user_ids, [bia.id, ana.id], 'Ordem de quem reagiu deve ser preservada')

  // 10. Removendo reação (Bia remove o 👍)
  console.log('10. Bia removendo reação 👍...')
  const removeReact = await api(
    `/channels/${channel.id}/messages/${msg1.id}/reactions?emoji=${encodeURIComponent('👍')}`,
    {
      token: bia.token,
      method: 'DELETE'
    }
  )
  assert.equal(removeReact.status, 200)

  const wsReactRemove = await waitForWsEvent(
    anaWs.events,
    (e) =>
      e.type === 'message:reaction:remove' &&
      e.payload?.message_id === msg1.id &&
      e.payload?.emoji === '👍' &&
      e.payload?.user_id === bia.id
  )
  assert.ok(wsReactRemove, 'Ana deve receber evento WS message:reaction:remove')

  const listMsgsAfter = await api(`/channels/${channel.id}/messages`, { token: bia.token })
  const thumbAfter = listMsgsAfter.body
    .find((m) => m.id === msg1.id)
    ?.reactions?.find((r) => r.emoji === '👍')
  assert.equal(thumbAfter?.count, 1)
  assert.deepEqual(thumbAfter?.user_ids, [ana.id])
  console.log('   Adição, agregação e remoção de reações confirmadas!')

  // 11. Chat em Mensagem Direta (DM): texto, GIF, reação e bloqueio de figurinha de servidor
  console.log('11. Testando chat em Mensagem Direta (DM), envio de GIF, reações e prévia na lista...')
  // Como Ana e Bia estão no mesmo servidor, podem abrir DM
  const convRes = await api(`/conversations/with/${bia.id}`, {
    token: ana.token
  })
  assert.ok(
    convRes.status === 200 || convRes.status === 201,
    `Abrir DM deve retornar 200/201: ${JSON.stringify(convRes.body)}`
  )
  const convId = convRes.body.id

  const dmText = await api(`/conversations/${convId}/messages`, {
    token: ana.token,
    method: 'POST',
    body: { content: 'Oi Bia na DM!' }
  })
  assert.equal(dmText.status, 201)

  // Figurinha de servidor em DM deve ser recusada com 400
  const dmStickerAttempt = await api(`/conversations/${convId}/messages`, {
    token: ana.token,
    method: 'POST',
    body: { content: '', sticker_id: sticker.id }
  })
  assert.equal(dmStickerAttempt.status, 400, 'Figurinha de servidor não deve ser aceita em DM')

  // Bia envia um GIF sem texto na DM
  const dmGif = await api(`/conversations/${convId}/messages`, {
    token: bia.token,
    method: 'POST',
    body: {
      content: '',
      gif_url: 'https://media.giphy.com/media/dmgif/giphy.gif',
      gif_metadata: { width: 320, height: 240 }
    }
  })
  assert.equal(dmGif.status, 201, `Envio de GIF na DM deve retornar 201: ${JSON.stringify(dmGif.body)}`)

  // Ana reage com ❤️ ao GIF da Bia na DM
  const dmReact = await api(`/conversations/${convId}/messages/${dmGif.body.id}/reactions`, {
    token: ana.token,
    method: 'POST',
    body: { emoji: '❤️' }
  })
  assert.equal(dmReact.status, 200)

  // Verifica que a listagem de conversas mostra '👾 GIF' como prévia da última mensagem sem texto
  const convList = await api('/conversations', { token: ana.token })
  assert.equal(convList.status, 200)
  const foundConv = convList.body.find((c) => c.id === convId)
  assert.ok(foundConv, 'Conversa DM deve aparecer na lista')
  assert.equal(
    foundConv.last_message?.content,
    '👾 GIF',
    'Prévia da última mensagem de GIF sem texto na DM deve ser "👾 GIF"'
  )
  console.log('   DM testada com sucesso (texto, GIF, reações e prévia last_message = "👾 GIF")!')

  // 12. GIFs pela KLIPY: o app chama a KLIPY direto; o servidor só entrega a
  // configuração (503 sem KLIPY_API_KEY). As rotas antigas /gifs/trending e
  // /search só funcionam com KLIPY_PROXY_SERVIDOR=1 (senão 503). Docs: ADR 0053.
  console.log('12. Testando a configuração de GIFs (KLIPY) e as rotas antigas...')
  const cfgRes = await api('/gifs/config', { token: bia.token })
  assert.ok([200, 503].includes(cfgRes.status), `config de GIFs: status ${cfgRes.status}`)
  if (cfgRes.status === 200) {
    assert.equal(cfgRes.body.provider, 'klipy')
    assert.ok(cfgRes.body.app_key && cfgRes.body.customer_id)
    assert.ok(!JSON.stringify(cfgRes.body).includes(bia.id ?? '\u0000'), 'o id real não pode ir na config')
  } else {
    assert.equal(cfgRes.body.error, 'gifs_unavailable')
  }
  for (const path of ['/gifs/trending', '/gifs/search?q=cats']) {
    const res = await api(path, { token: bia.token })
    assert.ok([200, 503].includes(res.status), `${path}: status ${res.status}`)
    if (res.status === 200) assert.ok(Array.isArray(res.body))
  }
  console.log(`   Config de GIFs: ${cfgRes.status} (200 = chave da KLIPY no servidor; 503 = sem chave)`)

  // 13. Permissões e Exclusão de Figurinha + Evento WS sticker:deleted
  console.log('13. Testando permissões de exclusão de figurinha e evento WS sticker:deleted...')
  const forbiddenDelStk = await api(`/servers/${serverId}/stickers/${sticker.id}`, {
    token: bia.token,
    method: 'DELETE'
  })
  assert.equal(
    forbiddenDelStk.status,
    403,
    'Membro comum que não enviou a figurinha não pode excluí-la (403)'
  )

  const delStk = await api(`/servers/${serverId}/stickers/${sticker.id}`, {
    token: ana.token,
    method: 'DELETE'
  })
  assert.equal(delStk.status, 200)

  const wsStickerDeleted = await waitForWsEvent(
    biaWs.events,
    (e) => e.type === 'sticker:deleted' && e.payload?.sticker_id === sticker.id
  )
  assert.ok(wsStickerDeleted, 'Bia deve receber evento WS sticker:deleted')

  const listStkEmpty = await api(`/servers/${serverId}/stickers`, { token: ana.token })
  assert.equal(listStkEmpty.body.length, 0, 'Servidor não deve ter mais figurinhas')
  console.log('   Permissões e exclusão de figurinha (com WS sticker:deleted) confirmadas!')

  // 14. Mensagem com figurinha excluída continua legível e exclusão de mensagem funciona
  console.log('14. Conferindo histórico pós-exclusão de figurinha e exclusão de mensagem...')
  const listMsgsFinal = await api(`/channels/${channel.id}/messages`, { token: bia.token })
  const finalMsg1 = listMsgsFinal.body.find((m) => m.id === msg1.id)
  assert.ok(finalMsg1, 'Mensagem deve continuar existindo após figurinha ser excluída')
  assert.equal(finalMsg1.sticker_id ?? null, null, 'sticker_id deve ficar null após ON DELETE SET NULL')

  const delMsg2 = await api(`/channels/${channel.id}/messages/${msg2.id}`, {
    token: bia.token,
    method: 'DELETE'
  })
  assert.ok(delMsg2.status === 200 || delMsg2.status === 204)
  const wsMsgDelete = await waitForWsEvent(
    anaWs.events,
    (e) => e.type === 'message:delete' && e.payload?.message_id === msg2.id
  )
  assert.ok(wsMsgDelete, 'Ana deve receber evento WS message:delete')

  biaWs.ws.close()
  anaWs.ws.close()

  console.log('\n=======================================================')
  console.log('🎉 TODOS OS 14 TESTES END-TO-END (E2E) PASSARAM 100%!')
  console.log('=======================================================\n')
}

runTests().catch((err) => {
  console.error('\n❌ ERRO NO TESTE E2E:', err)
  process.exit(1)
})

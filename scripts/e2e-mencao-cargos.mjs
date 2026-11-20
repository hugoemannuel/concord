// E2E da menção de cargos (sem navegador): quem pode mencionar, o que o
// servidor grava em mention_roles, o anti-spam único com o @all, a edição que
// só tira, o @everyone como @all, os meus cargos por servidor e a preferência
// de ignorar menções de cargo. Roda contra um backend ligado: use um banco
// descartável, pois cria usuários e um servidor de teste.
// Uso (Node 22+):
//   API=http://localhost:8080/api BACKEND_LOG=<saída do backend> node scripts/e2e-mencao-cargos.mjs
import { createE2E } from './lib/e2e.mjs'

const BASE = process.env.API ?? 'http://localhost:8080/api'
const tag = Math.random().toString(16).slice(2, 8)
const failures = []
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${cond ? '' : '  ' + extra}`)
  if (!cond) failures.push(name)
}
const json = (v) => JSON.stringify(v)

const e2e = createE2E({ api: BASE, run: tag })
// (método, caminho, token, corpo) → { status, body }, sem lançar.
const api = (method, path, token, body) => e2e.request(path, { method, token, body })

const [dono, ana, bia] = await Promise.all([e2e.makeUser('dono'), e2e.makeUser('ana'), e2e.makeUser('bia')])

const { body: srv } = await api('POST', '/servers', dono.token, { name: 'Menção de cargos' })
const sid = srv.id
const { body: code } = await api('GET', `/servers/${sid}/invite-code`, dono.token)
for (const u of [ana, bia]) await api('POST', '/invites/join', u.token, { code: code.code })
const { body: chans } = await api('GET', `/servers/${sid}/channels`, dono.token)
const geral = chans.find((c) => c.type === 'text')
const { body: outro } = await api('POST', `/servers/${sid}/channels`, dono.token, { name: 'outro', type: 'text' })

// --- cargos: um aberto a todos, um fechado
const { body: suporte } = await api('POST', `/servers/${sid}/roles`, dono.token, { name: 'Suporte' })
const { body: equipe } = await api('POST', `/servers/${sid}/roles`, dono.token, { name: 'Equipe de Suporte' })
check('cargo novo nasce sem "qualquer pessoa pode mencionar"', suporte.mentionable === false, json(suporte))
const aberto = await api('PATCH', `/servers/${sid}/roles/${suporte.id}`, dono.token, { mentionable: true })
check('dono liga a chave do cargo', aberto.status === 200 && aberto.body.mentionable === true, json(aberto.body))
const { body: roles } = await api('GET', `/servers/${sid}/roles`, dono.token)
const everyone = roles.find((r) => r.is_default)
const fixo = await api('PATCH', `/servers/${sid}/roles/${everyone.id}`, dono.token, { mentionable: true })
check('@everyone não vira mencionável', fixo.status >= 400, `status ${fixo.status}`)

// --- meus cargos por servidor
await api('PUT', `/servers/${sid}/members/${bia.id}/roles/${suporte.id}`, dono.token)
const minhasBia = await api('GET', '/users/me/server-roles', bia.token)
check('bia vê o próprio cargo naquele servidor', json(minhasBia.body) === json({ [sid]: [suporte.id] }), json(minhasBia.body))
const minhasAna = await api('GET', '/users/me/server-roles', ana.token)
check('ana, sem cargo, recebe um objeto vazio', minhasAna.status === 200 && json(minhasAna.body) === '{}', json(minhasAna.body))
check('sem login, 401', (await api('GET', '/users/me/server-roles')).status === 401)

// --- quem pode mencionar
const texto = '@suporte e @equipe-de-suporte, alguém?'
const ids = [suporte.id, equipe.id]
const send = (user, channel, content, mention_role_ids) =>
  api('POST', `/channels/${channel.id}/messages`, user.token, { content, ...(mention_role_ids ? { mention_role_ids } : {}) })
const idsOf = (msg) => (msg.mention_roles ?? []).map((r) => r.id)

const deAna = await send(ana, geral, texto, ids)
check('membro comum pinga só o cargo aberto', deAna.status === 201 && json(idsOf(deAna.body)) === json([suporte.id]), json(deAna.body.mention_roles))
check('a mensagem guarda o handle escrito', deAna.body.mention_roles?.[0]?.handle === 'suporte', json(deAna.body.mention_roles))

const deDono = await send(dono, geral, texto, ids)
check('o dono pinga os dois cargos', json(idsOf(deDono.body)) === json(ids), json(deDono.body.mention_roles))

const semIds = await send(bia, geral, texto)
check('o texto sozinho, sem os ids, não pinga cargo', semIds.status === 201 && semIds.body.mention_roles == null, json(semIds.body.mention_roles))

const foraDoTexto = await send(bia, geral, 'oi pessoal', ids)
check('id de cargo cujo @handle não está no texto é ignorado', foraDoTexto.body.mention_roles == null, json(foraDoTexto.body.mention_roles))

// --- anti-spam único (30 s por autor, por canal)
const repetida = await send(ana, geral, '@suporte de novo', [suporte.id])
check('segunda menção do mesmo autor no canal dentro de 30 s não pinga', repetida.status === 201 && repetida.body.mention_roles == null, json(repetida.body.mention_roles))
const emOutroCanal = await send(ana, outro, '@suporte em outro canal', [suporte.id])
check('em outro canal o mesmo autor pinga', json(idsOf(emOutroCanal.body)) === json([suporte.id]), json(emOutroCanal.body.mention_roles))
const todos = await send(dono, geral, '@all reunião', undefined)
check('@all dentro dos 30 s de uma menção de cargo do mesmo autor não pinga', todos.body.mention_everyone == null, json(todos.body.mention_everyone))

// --- @everyone = @all
const alias = await send(dono, outro, '@everyone reunião')
check('@everyone é gravado como @all', alias.body.mention_everyone === 'all', json(alias.body.mention_everyone))
const aliasSemPermissao = await send(bia, outro, '@everyone reunião')
check('@everyone de quem não tem a permissão é texto', aliasSemPermissao.body.mention_everyone == null, json(aliasSemPermissao.body.mention_everyone))

// --- leitura e edição
const { body: lista } = await api('GET', `/channels/${geral.id}/messages`, bia.token)
const lida = lista.find((m) => m.id === deDono.body.id)
check('a listagem devolve mention_roles', json(idsOf(lida ?? {})) === json(ids), json(lida?.mention_roles))

const editada = await api('PATCH', `/channels/${geral.id}/messages/${deDono.body.id}`, dono.token, { content: 'só o @suporte agora' })
check('editar tira o cargo que saiu do texto', editada.status === 200 && json(idsOf(editada.body)) === json([suporte.id]), json(editada.body))
const comMais = await api('PATCH', `/channels/${geral.id}/messages/${semIds.body.id}`, bia.token, { content: '@suporte agora com ping?' })
check('editar nunca põe cargo', comMais.status === 200 && comMais.body.mention_roles == null, json(comMais.body.mention_roles))

// --- DM: cargo é texto
const dm = await api('GET', `/conversations/with/${ana.id}`, dono.token)
const naDm = await api('POST', `/conversations/${dm.body?.id}/messages`, dono.token, { content: '@suporte', mention_role_ids: [suporte.id] })
check('em DM o cargo não pinga', naDm.status === 201 && naDm.body.mention_roles == null, `status ${naDm.status} ${json(naDm.body)}`)

// --- ignorar menções de cargo (por servidor)
const prefs = await api('PUT', `/servers/${sid}/notification-settings`, bia.token, { muted: false, level: 'all', suppress_everyone: false, suppress_roles: true })
check('bia liga "ignorar menções de cargo"', prefs.status === 200 && prefs.body.suppress_roles === true, json(prefs.body))
const { body: todas } = await api('GET', '/users/me/notification-settings', bia.token)
check('a preferência volta na leitura', todas.servers?.[sid]?.suppress_roles === true, json(todas.servers))
const noCanal = await api('PUT', `/servers/${sid}/channels/${geral.id}/notification-settings`, bia.token, { muted: true, level: 'all', suppress_roles: true })
check('por canal a preferência não vale', noCanal.status === 200 && !noCanal.body.suppress_roles, json(noCanal.body))

console.log(failures.length ? `\n${failures.length} falha(s): ${failures.join('; ')}` : '\nTudo certo.')
process.exit(failures.length ? 1 : 0)

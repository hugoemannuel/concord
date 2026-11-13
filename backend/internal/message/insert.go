package message

// insertMessageSQL é o INSERT único de mensagem (Create e CreateWithAttachments).
// O prazo (expires_at) nasce aqui: só vale em conversa com o modo temporário
// ligado (conversa ou canal) e nunca em aviso de sistema (system_kind
// preenchido, D5).
const insertMessageSQL = `
	INSERT INTO messages (id, author_id, channel_id, conversation_id, reply_to_id, content, system_kind, mention_everyone, sticker_id, gif_url, gif_metadata, call_invite, tts, tts_voice_channel_id, expires_at)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
		CASE WHEN $7::varchar IS NULL THEN
			` + expiresAtDaSalaSQL + `
		END)
	RETURNING
		id,
		author_id,
		channel_id,
		conversation_id,
		reply_to_id,
		content,
		created_at
`

// expiresAtDaSalaSQL é o prazo de uma mensagem que não é aviso de sistema,
// conforme o modo da sala de destino: a conversa ($4) ou, sem conversa, o
// canal ($3). Vale também para a cópia encaminhada (D14).
// Pressupõe $3 = channel_id e $4 = conversation_id em todo INSERT que a usa
// (insertMessageSQL, insertForwarded e CreateWithPoll).
const expiresAtDaSalaSQL = `COALESCE(
	(SELECT now() + make_interval(secs => c.disappearing_seconds) FROM conversations c WHERE c.id = $4::uuid),
	(SELECT now() + make_interval(secs => ch.disappearing_seconds) FROM channels ch WHERE ch.id = $3::uuid))`

// notExpired esconde a mensagem vencida: o sweeper apaga de verdade só de
// tempos em tempos, e nesse intervalo nenhuma leitura pode devolvê-la.
// Vale para a tabela com o alias m (o pacote conversation repete a condição).
const notExpired = "(m.expires_at IS NULL OR m.expires_at > now())"

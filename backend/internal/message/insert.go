package message

// insertMessageSQL é o INSERT único de mensagem (Create e CreateWithAttachments).
// O prazo (expires_at) nasce aqui: só vale em conversa com o modo temporário
// ligado e nunca em aviso de sistema (system_kind preenchido, D5). Canal tem
// conversation_id NULL e fica sem prazo.
const insertMessageSQL = `
	INSERT INTO messages (id, author_id, channel_id, conversation_id, reply_to_id, content, system_kind, mention_everyone, sticker_id, gif_url, gif_metadata, call_invite, tts, tts_voice_channel_id, expires_at)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
		CASE WHEN $7::varchar IS NULL THEN
			(SELECT now() + make_interval(secs => c.disappearing_seconds) FROM conversations c WHERE c.id = $4::uuid)
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

// expiresAtDaConversaSQL é o prazo de uma mensagem que não é aviso de sistema,
// conforme o modo da conversa de destino (a cópia encaminhada, D14).
const expiresAtDaConversaSQL = `(SELECT now() + make_interval(secs => c.disappearing_seconds) FROM conversations c WHERE c.id = $4::uuid)`

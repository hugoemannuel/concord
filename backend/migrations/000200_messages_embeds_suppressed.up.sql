-- O autor tirou as prévias de link da mensagem (o X do cartão, como no Discord).
ALTER TABLE messages ADD COLUMN IF NOT EXISTS embeds_suppressed BOOLEAN NOT NULL DEFAULT false;

-- Avatar dos bots vindo do servidor (internal/bot/avatar.go serve as imagens):
-- os apps deixam de reconhecer o Maestro e o Salinha Bot pelo UUID para
-- desenhar a foto. Só preenche se ainda não tiver avatar.
UPDATE users SET avatar_url = '/api/bot-media/a_maestro'
WHERE id = '4d414553-5452-4f00-8000-000000000001' AND avatar_url IS NULL;

UPDATE users SET avatar_url = '/api/bot-media/salinha-bot'
WHERE id = '53414c49-4e48-4100-8000-000000000002' AND avatar_url IS NULL;

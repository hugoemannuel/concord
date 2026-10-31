# 0039. Revogar sessões com uma versão no token de acesso e refresh token guardado como hash

- Status: aceito
- Data: 2026-10-31

## Contexto
A auditoria de segurança (2026-10-31) achou: o token de acesso (JWT HS256, 24 h)
não podia ser revogado (sair e redefinir a senha só apagavam os refresh tokens),
o WebSocket aberto continuava conectado, os refresh tokens ficavam em texto puro
no banco e nos backups, sem limpeza dos vencidos, e a rotação não era atômica
(dois usos simultâneos geravam dois pares). As forças: revogar na hora sem ir ao
banco a cada pedido; não deslogar ninguém na migração; um processo de backend só
(sem Redis).

## Opções consideradas
1. **Token de acesso curto (15 min)**: revogação "eventual" sem estado, mas
   mexe no fluxo de todos os apps (renovação frequente, inclusive no WS) e ainda
   deixa 15 min de janela.
2. **Tabela de sessões / lista negra de `jti`**: revoga um dispositivo
   específico, mas exige consulta por pedido (ou cache por `jti`) e uma tela de
   sessões que o app não tem.
3. **Versão da sessão na conta (`users.token_version`)**: o token de acesso leva
   a versão (claim `ver`); o middleware e o WS conferem contra a versão atual
   num cache de 1 min; revogar = incrementar. É o padrão "token versioning"
   (revogação por usuário), simples e sem tabela nova.

## Decisão
Opção 3, mais o refresh token com hash:

- `users.token_version INTEGER NOT NULL DEFAULT 0`. Token sem `ver` (de antes
  do deploy) vale como 0, então ninguém sai na migração, e o token antigo para
  de valer assim que a pessoa revoga.
- `auth.VersionCache`: versão em memória por 1 min; quem revoga neste processo
  esquece na hora (`Forget`). Banco fora responde 503 (não 401), para ninguém ser
  deslogado por falha nossa. Conta que não existe = sessão encerrada.
- Conferido em `AuthMiddleware`, `MemberOrGuestMiddleware`,
  `OptionalAuthMiddleware` (vira anônimo) e no connect do WebSocket. O token de
  mídia (1 h, só para anexos) e o de visitante não têm versão.
- Incrementam a versão: `POST /auth/logout-all` ("Sair de todos os
  dispositivos"), redefinir a senha e excluir a conta (ADR 0038, a linha some).
  Depois, as conexões WS da conta fecham com 4001 e o app volta ao login.
- `refresh_tokens.token_hash` = sha256 hex; a migration 000185 converte os
  existentes em SQL com o mesmo cálculo (teste `TestDBHashDoRefreshIgualAoDaMigration`)
  e apaga os vencidos. Renovar consome com `DELETE … RETURNING` (uso único,
  `TestDBRefreshUsoUnicoMesmoAoMesmoTempo`). Os vencidos saem a cada 6 h.
- `POST /auth/logout {refresh_token}` sai só deste dispositivo; sem o token
  (apps antigos), apaga todos os refresh tokens, como antes.

## Consequências
- Não há revogação de um dispositivo só para tokens de acesso (só pelo refresh,
  que para de renovar); "sair de todos" é o botão de emergência.
- Sem detecção de reuso por família de refresh tokens: um refresh roubado e
  usado antes do dono troca o par uma vez. Fica para depois, se precisar.
- Com mais de um processo de backend, a revogação vale nos outros em até 1 min
  (o TTL do cache).
- Voltar a migration 000185 desloga todo mundo (o texto dos refresh tokens não
  existe mais).

## Fontes
- Token versioning/revogação por usuário e refresh com hash e rotação:
  https://www.techinterview.org/post/3233468216/lld-token-refresh/
- Refresh token guardado como SHA-256, rotação e família:
  https://hexdocs.pm/sigra/Sigra.JWT.RefreshToken.html
- OWASP JWT Cheat Sheet (revogação, "token denylist"):
  https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html

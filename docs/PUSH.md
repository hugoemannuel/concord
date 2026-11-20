# Push do app mobile (Android)

Decisão e desenho: [ADR 0022](adr/0022-push-direto-pelo-fcm.md) e a spec
`docs/superpowers/specs/2026-10-29-app-mobile-push-design.md`.

O backend fala direto com o FCM (HTTP v1), sem Expo Push e sem dependência nova.
**Sem as credenciais abaixo tudo continua funcionando**: o backend loga
`[push] push desligado` e o app compila e roda sem push.

## O que é notificado

Só quando a pessoa **não está online** (sem app aberto) e **não está em Não perturbar**:

- mensagem em DM ou grupo (de outra pessoa);
- menção em canal: `@usuario`, um cargo que a pessoa tem (`mention_roles`) ou `@all` (`@here` não notifica);
- pedido de amizade recebido.
- **chamada de DM** (1:1): "{nome} está te ligando", em um canal de alta prioridade (`chamadas`). Com o push ligado, o
  backend passa a deixar ligar para quem está offline **e tem o app com push registrado**; sem push registrado a
  chamada continua recusada. A chamada sem resposta termina em 45 s.

Respeita as preferências já existentes (`notifysettings`): canal/servidor silenciado,
nível "só menções"/"nada", "suprimir @everyone" e "ignorar menções de cargo" (cada um corta só quem foi
alcançado daquele jeito; quem foi citado pelo nome recebe). Menção em canal que a pessoa não enxerga não gera push.

## Passo a passo do dono

1. Crie um projeto no [Firebase Console](https://console.firebase.google.com).
2. Adicione um app **Android** com o pacote `com.salinha.app`.
3. Baixe o `google-services.json`. **Não commite** (segredo do dono).
4. Em Configurações do projeto → Contas de serviço → **Gerar nova chave privada**.
   O JSON baixado também é segredo.

## Configuração

| Onde | Variável | Valor |
|---|---|---|
| Build do APK (`node scripts/mobile-build.mjs`) | `GOOGLE_SERVICES_JSON` | caminho do `google-services.json` |
| Backend | `FCM_SERVICE_ACCOUNT_FILE` | caminho do JSON da conta de serviço |
| Backend (alternativa) | `FCM_SERVICE_ACCOUNT_JSON` | o conteúdo do JSON, em uma variável |
| Backend (testes) | `FCM_ENDPOINT`, `FCM_TOKEN_URL` | URLs de um servidor FCM falso |

Depois de configurar, reinicie o backend e confira o log `[push] push ligado`.
O APK precisa ser **regerado** com `GOOGLE_SERVICES_JSON` definido; o APK de antes não tem Firebase.

## Como funciona

- O app pede permissão (Android 13+), cria o canal `mensagens` e envia o token FCM em
  `PUT /api/push/token` depois do login; `DELETE /api/push/token` ao sair da conta.
- Token inválido devolvido pelo FCM (`UNREGISTERED`) é apagado do banco.
- Tocar na notificação abre a DM, o canal ou a tela de amigos (também com o app fechado).

## Ainda não verificado

Entrega real com um projeto Firebase de verdade: só dá para testar depois de criar o
projeto. Os testes automatizados cobrem o cliente FCM contra um servidor falso, o
notificador, as rotas de token e o lado do app com portas simuladas.

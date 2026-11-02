# 0050. Buscar o placar na API pública da ESPN, direto do navegador do plugin

- Status: proposto
- Data: 2026-11-02

## Contexto

O plugin oficial "Placar ao vivo" (issue #480) mostra os jogos do Atlético-MG e do Cruzeiro em todos os
campeonatos (Série A, Copa do Brasil, Libertadores, Sul-Americana e Mineiro), com minuto e gols ao vivo, e
precisa ser grátis. É um plugin como os de terceiros (ADR 0049): uma página num iframe isolado, que não
recebe nada da Salinha.

## Opções consideradas

1. **API pública da ESPN (`site.api.espn.com`), chamada pela página.** Grátis e sem chave, cobre os 5
   campeonatos, traz minuto, gols e logos, e responde com `Access-Control-Allow-Origin: *` e cache de 10 s.
   Contra: não é documentada nem tem garantia, e pode mudar ou bloquear sem aviso.
2. **API-Football, plano grátis.** Documentada, mas tem chave (não pode ficar numa página pública) e limite
   de 100 pedidos por dia. Não dá para atualizar a cada 30 s.
3. **football-data.org, plano grátis.** Documentada, mas tem placar atrasado e não cobre Copa do Brasil nem
   Mineiro.
4. **Qualquer fonte atrás de um endpoint do nosso backend, com cache.** Esconde a fonte e faz uma consulta
   só, mas amarra o plugin ao monólito. Com o número de usuários atual não traz ganho.

## Decisão

Opção 1, com todo o acesso à ESPN isolado num módulo (`site/plugins/placar/espn.js`) que devolve um modelo
próprio do plugin. Se a ESPN mudar ou cair, a troca de fonte fica nesse módulo. A opção 4 vira o caminho
se o tráfego crescer ou se a ESPN passar a bloquear chamadas do navegador.

## Consequências

- Não há mudança no backend nem no app. A página vai no `site/` e sai no deploy que já existe.
- Se a ESPN falhar, todo painel aberto mostra "Não deu para atualizar o placar agora." com os últimos
  dados, até a ESPN voltar ou sair uma versão nova.
- A CSP da página só libera `site.api.espn.com` (dados) e `a.espncdn.com` (logos).

## Fontes

- Testes manuais da API da ESPN em 2026-11-02 (`/soccer/{slug}/scoreboard`, `/soccer/all/teams/{id}/schedule`).
- football-data.org, limites do plano grátis: https://www.thestatsapi.com/blog/football-data-org-free-tier-limits-2026
- API-Football, guia inicial (limite diário): https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide

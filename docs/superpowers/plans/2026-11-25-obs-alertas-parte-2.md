# Plano: alertas, parte 2 (API, VPS, erros e resumo diário)

Tarefa obs-alertas2. Motor da parte 1: `backend/internal/alert` (ADR 0071). Emenda no
ADR 0071; migration 000220 (só a marca do resumo diário).

## Decisões

- **Condições** (algo que vale enquanto dura) viram `Rule` (um `rule_<nome>.go`), com a
  histerese do motor. **Acontecimentos** (máquina congelada, erro novo) viram `Event`
  por um vigia próprio, como o `DatabaseWatch`. O **resumo diário** é uma tarefa com
  horário, marcada no banco (`alert_daily_summaries`) para sair uma vez por dia.
- Lembrete por regra (`Rule.Remind`, padrão 6 h): a capacidade das lives lembra a cada
  7 dias.
- Fontes: `alert.Feeds` junta o `Repository` do alerta com as leituras do `serverobs`
  (host/API), do `apperrors` (erros) — interfaces estreitas, fakes nos testes.
- Vigias e o resumo rodam pelo `Runner.Watches` (uma linha cada, depois do boot).

## Tarefas (cada uma com teste primeiro)

1. Estrutural: `Rule.Remind`, `Feeds`, `Runner.Watches`, `every()`. Sem mudar
   comportamento.
2. Regras de infra: disco e inodes, backup atrasado/encolhido, API com 5xx, panic, API
   lenta, pool do banco, swap, steal, UDP, coleta parada, capacidade das lives.
3. Vigia do congelamento (RTC × relógio do sistema; salto parede × monotônico).
4. `#erros`: erro novo (com teto) e pico de erro. `#qualidade`: decodificador falhando.
5. Resumo diário (migration 000220) e a retenção dela.
6. Painel: títulos novos, coluna Canal, último resumo.
7. Docs: ADR 0071 (emenda), OBSERVABILIDADE.md § Alertas, HOSPEDAGEM.md.
8. `affected-tests pr` verde, revisão por subagente, relatório.

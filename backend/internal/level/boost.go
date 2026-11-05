package level

import "gin-quickstart/backend/internal/call"

// boostPercent é o multiplicador de XP (em %) de uma call com `eligible`
// pessoas ganhando XP: 100 = sem buff. Os degraus seguem o ranking de estilo
// do cliente: D (3–4), C (5–6), B (7–9), A (10–12), S (13–15), SS (16–19),
// SSS (20+). 2 pessoas é a call normal, sem buff.
func boostPercent(eligible int) int {
	switch {
	case eligible >= 20:
		return 400
	case eligible >= 16:
		return 300
	case eligible >= 13:
		return 250
	case eligible >= 10:
		return 200
	case eligible >= 7:
		return 175
	case eligible >= 5:
		return 150
	case eligible >= 3:
		return 125
	default:
		return 100
	}
}

// callBoost é o buff de uma call neste instante.
type callBoost struct {
	percent  int
	eligible int
}

// callBoosts agrupa quem está elegível por call e devolve o buff de cada uma.
func callBoosts(active []call.VoiceActivity) map[string]callBoost {
	users := make(map[string]map[string]bool)
	for _, a := range active {
		if users[a.CallID] == nil {
			users[a.CallID] = make(map[string]bool)
		}
		users[a.CallID][a.UserID] = true
	}

	boosts := make(map[string]callBoost, len(users))
	for callID, ids := range users {
		boosts[callID] = callBoost{percent: boostPercent(len(ids)), eligible: len(ids)}
	}
	return boosts
}

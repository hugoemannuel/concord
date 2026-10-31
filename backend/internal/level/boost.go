package level

import "gin-quickstart/backend/internal/call"

// boostPercent é o multiplicador de XP (em %) de uma call com `eligible`
// pessoas ganhando XP: 100 = sem buff. Os degraus seguem o ranking de estilo
// do cliente: D (2), C (3), B (4), A (5), S (6–7), SS (8–9), SSS (10+).
func boostPercent(eligible int) int {
	switch {
	case eligible >= 10:
		return 400
	case eligible >= 8:
		return 300
	case eligible >= 6:
		return 250
	case eligible >= 5:
		return 200
	case eligible >= 4:
		return 175
	case eligible >= 3:
		return 150
	case eligible >= 2:
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

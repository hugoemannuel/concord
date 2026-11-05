package level

import (
	"testing"

	"gin-quickstart/backend/internal/call"
)

func TestBoostPercentSteps(t *testing.T) {
	cases := map[int]int{
		0: 100, 1: 100, 2: 100, // sem buff (2 pessoas é a call normal)
		3: 125, 4: 125, // D
		5: 150, 6: 150, // C
		7: 175, 9: 175, // B
		10: 200, 12: 200, // A
		13: 250, 15: 250, // S
		16: 300, 19: 300, // SS
		20: 400, 50: 400, // SSS (teto)
	}
	for eligible, want := range cases {
		if got := boostPercent(eligible); got != want {
			t.Errorf("boostPercent(%d) = %d, want %d", eligible, got, want)
		}
	}
}

func TestCallBoostsGroupsByCallAndCountsDistinctUsers(t *testing.T) {
	active := []call.VoiceActivity{
		{UserID: "a", CallID: "c1"}, {UserID: "b", CallID: "c1"},
		{UserID: "c", CallID: "c1"}, {UserID: "d", CallID: "c1"},
		{UserID: "d", CallID: "c1"}, // duplicada: não conta duas vezes
		{UserID: "x", CallID: "c2"}, {UserID: "y", CallID: "c2"},
		{UserID: "z", CallID: "c3"},
	}

	got := callBoosts(active)

	if got["c1"] != (callBoost{percent: 125, eligible: 4}) {
		t.Errorf("c1 = %+v, want 125%% with 4 eligible", got["c1"])
	}
	if got["c2"] != (callBoost{percent: 100, eligible: 2}) {
		t.Errorf("c2 = %+v, want 100%% with 2 eligible", got["c2"])
	}
	if got["c3"] != (callBoost{percent: 100, eligible: 1}) {
		t.Errorf("c3 = %+v, want 100%% with 1 eligible", got["c3"])
	}
}

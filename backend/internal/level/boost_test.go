package level

import (
	"testing"

	"gin-quickstart/backend/internal/call"
)

func TestBoostPercentSteps(t *testing.T) {
	cases := map[int]int{
		0: 100, 1: 100, // sem buff
		2: 125,         // D
		3: 150,         // C
		4: 175,         // B
		5: 200,         // A
		6: 250, 7: 250, // S
		8: 300, 9: 300, // SS
		10: 400, 11: 400, 50: 400, // SSS (teto)
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

	if got["c1"] != (callBoost{percent: 175, eligible: 4}) {
		t.Errorf("c1 = %+v, want 175%% with 4 eligible", got["c1"])
	}
	if got["c2"] != (callBoost{percent: 125, eligible: 2}) {
		t.Errorf("c2 = %+v, want 125%% with 2 eligible", got["c2"])
	}
	if got["c3"] != (callBoost{percent: 100, eligible: 1}) {
		t.Errorf("c3 = %+v, want 100%% with 1 eligible", got["c3"])
	}
}

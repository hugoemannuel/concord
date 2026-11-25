package liveobs

import (
	"slices"
	"testing"
)

func TestBreakdownsSeparamPlataformaRedeEAparelho(t *testing.T) {
	desk := session("d", KindShare, "ana", 0, 10)
	desk.Target, desk.Network = "desktop", ""
	web := session("w", KindWatch, "bia", 0, 10)
	web.Target, web.Network = "web", "4g"
	phone := session("p", KindCall, "caio", 0, 10)
	phone.Target, phone.Network, phone.Device = "android", "wifi", "samsung SM-A515F"
	phoneLive := session("pl", KindWatch, "caio", 0, 10)
	phoneLive.Target, phoneLive.Network, phoneLive.Device = "android", "cellular-4g", "samsung SM-A515F"

	got := breakdowns([]SessionStats{desk, web, phone, phoneLive})
	keys := func(name string) map[string]int {
		out := map[string]int{}
		for _, r := range got[name] {
			out[r.Key] = r.Sessions
		}
		return out
	}
	if k := keys("target"); k["android"] != 2 || k["desktop"] != 1 || k["web"] != 1 {
		t.Errorf("plataforma (com as calls) = %v", k)
	}
	// Rede só do Android: no desktop e na web o valor é o effectiveType do
	// Chromium ("4g" em ~90% das sessões), não o tipo de rede.
	if k := keys("network"); len(k) != 2 || k["wifi"] != 1 || k["cellular-4g"] != 1 {
		t.Errorf("rede (só o Android) = %v", k)
	}
	if k := keys("device"); len(k) != 1 || k["samsung SM-A515F"] != 2 {
		t.Errorf("aparelho (sem os vazios do desktop) = %v", k)
	}
}

func TestReasonsDoCelular(t *testing.T) {
	bg := session("bg", KindCall, "ana", 0, 10)
	bg.Backgrounds, bg.Reconnects = 1, 1
	if got := reasons(bg); !slices.Contains(got, "Caiu com o app em segundo plano") {
		t.Errorf("segundo plano com queda: %q", got)
	}
	net := session("net", KindCall, "bia", 0, 10)
	net.NetworkChanges, net.Failures = 2, 1
	if got := reasons(net); !slices.Contains(got, "Caiu ao trocar de rede") {
		t.Errorf("troca de rede com queda: %q", got)
	}
	calm := session("calm", KindCall, "caio", 0, 10)
	calm.Backgrounds, calm.NetworkChanges = 3, 2
	if got := reasons(calm); len(got) != 0 {
		t.Errorf("segundo plano e troca de rede sem queda não são motivo: %q", got)
	}
}

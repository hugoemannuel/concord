package liveobs

import (
	"strings"
	"testing"
)

// App Android (ADR 0070): a plataforma, o aparelho e os sinais do celular.

func TestValidateContextoAceitaSoAsPlataformasConhecidas(t *testing.T) {
	for target, want := range map[string]string{
		"desktop": "desktop", "web": "web", "android": "android", "ios": "", "<script>": "",
	} {
		r := validReport()
		r.Context.Target = target
		if err := r.Validate(); err != nil {
			t.Fatal(err)
		}
		if r.Context.Target != want {
			t.Errorf("target %q = %q, quer %q", target, r.Context.Target, want)
		}
	}
}

func TestValidateContextoCortaOAparelho(t *testing.T) {
	r := validReport()
	r.Context.Device = "  samsung " + strings.Repeat("m", 300)
	if err := r.Validate(); err != nil {
		t.Fatal(err)
	}
	if len(r.Context.Device) != maxText || !strings.HasPrefix(r.Context.Device, "samsung") {
		t.Errorf("aparelho = %q (%d bytes)", r.Context.Device, len(r.Context.Device))
	}
}

func TestValidateAceitaOsEventosDoCelular(t *testing.T) {
	r := validReport()
	r.Events = []Event{
		{Type: EventBackground}, {Type: EventForeground, Detail: "1,5 min"},
		{Type: EventNetworkChanged, Detail: "wifi → cellular-4g"}, {Type: EventAudioRoute, Detail: "bluetooth"},
	}
	if err := r.Validate(); err != nil {
		t.Fatal(err)
	}
	if len(r.Events) != 4 {
		t.Errorf("eventos = %+v, quer os 4 do celular", r.Events)
	}
}

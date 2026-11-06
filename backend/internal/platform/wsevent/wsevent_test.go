package wsevent

import "testing"

// Os apps já leem este formato: as chaves saem em ordem alfabética (payload
// antes de type) e payload nil vira null.
func TestMarshalMontaOEnvelopeDoWebSocket(t *testing.T) {
	casos := []struct {
		nome    string
		payload any
		quer    string
	}{
		{"com payload", map[string]any{"b": 2, "a": "x"}, `{"payload":{"a":"x","b":2},"type":"t:x"}`},
		{"sem payload", nil, `{"payload":null,"type":"t:x"}`},
		{"struct", struct {
			ID string `json:"id"`
		}{"1"}, `{"payload":{"id":"1"},"type":"t:x"}`},
	}
	for _, caso := range casos {
		t.Run(caso.nome, func(t *testing.T) {
			if got := string(Marshal("t:x", caso.payload)); got != caso.quer {
				t.Fatalf("Marshal = %s; quer %s", got, caso.quer)
			}
		})
	}
}

func TestMarshalPayloadInvalidoDevolveNil(t *testing.T) {
	if got := Marshal("t:x", make(chan int)); got != nil {
		t.Fatalf("Marshal = %s; quer nil", got)
	}
	if _, err := Encode("t:x", make(chan int)); err == nil {
		t.Fatal("Encode sem erro; quer erro")
	}
}

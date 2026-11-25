package serverobs

import (
	"strings"
	"testing"
)

func TestUpsertSQLColunaAColuna(t *testing.T) {
	got := upsertSQL("t", "minute, a,\n\tb", "minute")
	for _, want := range []string{"VALUES ($1,$2,$3)", "ON CONFLICT (minute)", "a = EXCLUDED.a", "b = EXCLUDED.b"} {
		if !strings.Contains(got, want) {
			t.Errorf("sql = %q, falta %q", got, want)
		}
	}
}

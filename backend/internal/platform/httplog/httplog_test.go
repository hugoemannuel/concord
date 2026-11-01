package httplog

import (
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestRedactQuery(t *testing.T) {
	cases := map[string]string{
		"/api/media/a1?token=segredo":           "/api/media/a1?token=REDACTED",
		"/ws?token=abc":                         "/ws?token=REDACTED",
		"/ws?ticket=abc&client=mobile":          "/ws?client=mobile&ticket=REDACTED",
		"/rtc/v1?access_token=lk&auto_sub=true": "/rtc/v1?access_token=REDACTED&auto_sub=true",
		"/api/channels/c1/messages?limit=50":    "/api/channels/c1/messages?limit=50",
		"/api/servers":                          "/api/servers",
		"/x?%zz=token":                          "/x",
	}
	for in, want := range cases {
		if got := RedactQuery(in); got != want {
			t.Fatalf("RedactQuery(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestFormatterNeverPrintsTheToken(t *testing.T) {
	line := Formatter(gin.LogFormatterParams{
		TimeStamp:  time.Now(),
		StatusCode: 200,
		Method:     "GET",
		Path:       "/api/media/a1?token=eyJhbGciOi.segredo",
		ClientIP:   "127.0.0.1",
	})
	if strings.Contains(line, "segredo") || !strings.Contains(line, "/api/media/a1?token=REDACTED") {
		t.Fatalf("linha de log = %q", line)
	}
}

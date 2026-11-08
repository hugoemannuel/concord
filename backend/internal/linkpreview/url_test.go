package linkpreview

import (
	"errors"
	"strings"
	"testing"
)

func TestNormalizeURL(t *testing.T) {
	ok := map[string]string{
		"https://WWW.Buser.com.br/Onibus?x=1#topo": "https://www.buser.com.br/Onibus?x=1",
		"HTTP://exemplo.com:80/a":                  "http://exemplo.com/a",
		"https://exemplo.com:443":                  "https://exemplo.com",
		"https://exemplo.com:80/":                  "https://exemplo.com:80/",
		"http://[2001:DB8::1]/":                    "http://[2001:db8::1]/",
		"  https://exemplo.com/a b ":               "https://exemplo.com/a%20b",
	}
	for in, want := range ok {
		got, err := NormalizeURL(in)
		if err != nil || got != want {
			t.Errorf("NormalizeURL(%q) = %q, %v; want %q", in, got, err, want)
		}
	}
	bad := []string{
		"", "ftp://exemplo.com/", "javascript:alert(1)", "https://user@exemplo.com/",
		"https://exemplo.com:8080/", "https:///sem-host", "exemplo.com",
		"https://exemplo.com/" + strings.Repeat("a", 2048),
	}
	for _, in := range bad {
		if _, err := NormalizeURL(in); !errors.Is(err, ErrInvalidURL) {
			t.Errorf("NormalizeURL(%q) err = %v, want ErrInvalidURL", in, err)
		}
	}
}

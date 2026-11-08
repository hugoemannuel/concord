package message

import "testing"

func TestStripCode(t *testing.T) {
	cases := []struct {
		content string
		want    string
	}{
		{"oi @ana", "oi @ana"},
		{"`@ana` oi", "  oi"},
		{"a ``x ` @ana`` b", "a   b"},
		{"```\n@ana\n``` @bia", "  @bia"},
		{"x\n```js\n@ana```", "x\n "},
		{"meio ```@ana``` fim", "meio   fim"},
		{"`sem fim @ana", "`sem fim @ana"},
		{"\\`@ana\\`", "\\`@ana\\`"},
		{"a\\b", "a\\b"},
		{"fim\\", "fim\\"},
		{"", ""},
	}
	for _, c := range cases {
		if got := StripCode(c.content); got != c.want {
			t.Errorf("StripCode(%q) = %q, esperava %q", c.content, got, c.want)
		}
	}
}

// Menção em massa dentro de código não pinga (como no Discord).
func TestDetectEveryoneMentionIgnoraCodigo(t *testing.T) {
	for _, content := range []string{"`@all`", "```\n@here\n```", "olha ``@all``"} {
		if got := DetectEveryoneMention(content); got != "" {
			t.Errorf("DetectEveryoneMention(%q) = %q, esperava vazio", content, got)
		}
	}
	if got := DetectEveryoneMention("`x` @all"); got != MentionAll {
		t.Errorf("fora do código continua valendo, veio %q", got)
	}
}

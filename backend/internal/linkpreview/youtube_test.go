package linkpreview

import "testing"

func TestYouTubeID(t *testing.T) {
	cases := map[string]string{
		"https://www.youtube.com/watch?v=dQw4w9WgXcQ":             "dQw4w9WgXcQ",
		"https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s":           "dQw4w9WgXcQ",
		"https://m.youtube.com/watch?feature=share&v=a_b-C1d2E3f": "a_b-C1d2E3f",
		"https://youtu.be/dQw4w9WgXcQ?si=abc":                     "dQw4w9WgXcQ",
		"https://www.youtube.com/shorts/dQw4w9WgXcQ":              "dQw4w9WgXcQ",
		"https://www.youtube.com/watch?v=curto":                   "",
		"https://www.youtube.com/watch?v=dQw4w9WgXcQ<script>":     "",
		"https://youtu.be/":                                       "",
		"https://www.youtube.com/channel/UC123":                   "",
		"https://evil.com/watch?v=dQw4w9WgXcQ":                    "",
		"https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ":        "",
		"::não é url": "",
	}
	for in, want := range cases {
		if got := YouTubeID(in); got != want {
			t.Errorf("YouTubeID(%q) = %q, want %q", in, got, want)
		}
	}
}

package linkpreview

import (
	"net/url"
	"regexp"
	"strings"
)

var youtubeIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{11}$`)

// youtubeHosts: onde fica o vídeo com ?v= ou /shorts/.
var youtubeHosts = map[string]bool{"youtube.com": true, "www.youtube.com": true, "m.youtube.com": true}

// YouTubeID tira o id do vídeo de youtube.com/watch?v=, youtu.be/ e
// youtube.com/shorts/; vazio se não for vídeo do YouTube ou o id não tiver
// a forma de um (11 de [A-Za-z0-9_-]), já que ele vai para a URL do player.
func YouTubeID(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	host := strings.ToLower(u.Hostname())
	var id string
	switch {
	case host == "youtu.be":
		id = strings.TrimPrefix(u.Path, "/")
	case youtubeHosts[host] && u.Path == "/watch":
		id = u.Query().Get("v")
	case youtubeHosts[host] && strings.HasPrefix(u.Path, "/shorts/"):
		id = strings.TrimPrefix(u.Path, "/shorts/")
	}
	if !youtubeIDPattern.MatchString(id) {
		return ""
	}
	return id
}

package musiclinks

import (
	"context"
	"net/url"
)

// youtube: a busca do Maestro (yt-dlp, com cache). O mesmo ID serve ao
// YouTube Music: music.youtube.com/watch?v=ID abre já tocando.
type youtube struct{ videos VideoSearcher }

func (s *youtube) find(ctx context.Context, q Query) (Links, error) {
	videos, err := s.videos.FindVideos(ctx, q.searchText())
	if err != nil {
		return nil, err
	}
	cands := make([]candidate, 0, len(videos))
	for _, v := range videos {
		if v.ID != "" {
			cands = append(cands, candidate{v.Channel, v.Title, url.QueryEscape(v.ID)})
		}
	}
	id := pick(q, cands)
	if id == "" {
		return Links{}, nil
	}
	return Links{
		YouTube:      "https://www.youtube.com/watch?v=" + id,
		YouTubeMusic: "https://music.youtube.com/watch?v=" + id,
	}, nil
}

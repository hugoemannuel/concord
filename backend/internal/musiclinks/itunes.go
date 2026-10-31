package musiclinks

import (
	"context"
	"net/http"
	"net/url"
)

// itunes: iTunes Search API (Apple Music), pública e sem chave.
// https://performance-partners.apple.com/search-api
type itunes struct {
	base   string
	client *http.Client
}

func (s *itunes) find(ctx context.Context, q Query) (Links, error) {
	params := url.Values{
		"term": {searchTerm(q)}, "entity": {"song"}, "limit": {"5"}, "country": {"BR"},
	}
	var body struct {
		Results []struct {
			TrackName    string `json:"trackName"`
			ArtistName   string `json:"artistName"`
			TrackViewURL string `json:"trackViewUrl"`
		} `json:"results"`
	}
	if err := get(ctx, s.client, s.base+"/search?"+params.Encode(), &body); err != nil {
		return nil, err
	}
	cands := make([]candidate, len(body.Results))
	for i, r := range body.Results {
		cands[i] = candidate{r.ArtistName, r.TrackName, safeURL(r.TrackViewURL, "music.apple.com")}
	}
	return found(AppleMusic, pick(q, cands)), nil
}

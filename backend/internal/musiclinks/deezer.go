package musiclinks

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
)

// deezer: API pública do Deezer (/search), sem chave. A busca avançada
// (artist:"" track:"") falha com acento, então vai o texto simples.
// https://developers.deezer.com/api/search
type deezer struct {
	base   string
	client *http.Client
}

func (s *deezer) find(ctx context.Context, q Query) (Links, error) {
	params := url.Values{"q": {searchTerm(q)}, "limit": {"5"}}
	var body struct {
		Data []struct {
			Title  string `json:"title"`
			Link   string `json:"link"`
			Artist struct {
				Name string `json:"name"`
			} `json:"artist"`
		} `json:"data"`
		// Cota estourada vem com status 200 e este campo.
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := get(ctx, s.client, s.base+"/search?"+params.Encode(), &body); err != nil {
		return nil, err
	}
	if body.Error != nil {
		return nil, fmt.Errorf("deezer: %s", body.Error.Message)
	}
	cands := make([]candidate, len(body.Data))
	for i, r := range body.Data {
		cands[i] = candidate{r.Artist.Name, r.Title, safeURL(r.Link, "deezer.com")}
	}
	return found(Deezer, pick(q, cands)), nil
}

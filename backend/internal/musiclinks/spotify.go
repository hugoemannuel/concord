package musiclinks

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// spotify: Web API com client credentials (token do app, sem login de
// ninguém). Só liga com SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET; sem eles,
// o Spotify fica no link de busca. O Odesli (song.link) fechou a API sem chave.
// https://developer.spotify.com/documentation/web-api/tutorials/client-credentials-flow
type spotify struct {
	accounts, api string
	id, secret    string
	client        *http.Client

	mu      sync.Mutex
	token   string
	expires time.Time
}

func (s *spotify) find(ctx context.Context, q Query) (Links, error) {
	token, err := s.accessToken(ctx)
	if err != nil {
		return nil, err
	}
	search := `track:"` + cleanTitle(q.Title) + `"`
	if artist := strings.TrimSpace(q.Artist); artist != "" {
		search += ` artist:"` + firstArtistRaw(artist) + `"`
	}
	params := url.Values{"q": {search}, "type": {"track"}, "limit": {"5"}, "market": {"BR"}}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.api+"/v1/search?"+params.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	var body struct {
		Tracks struct {
			Items []struct {
				Name    string `json:"name"`
				Artists []struct {
					Name string `json:"name"`
				} `json:"artists"`
				ExternalURLs struct {
					Spotify string `json:"spotify"`
				} `json:"external_urls"`
			} `json:"items"`
		} `json:"tracks"`
	}
	if err := getJSON(ctx, s.client, req, &body); err != nil {
		return nil, err
	}
	cands := make([]candidate, len(body.Tracks.Items))
	for i, t := range body.Tracks.Items {
		names := make([]string, len(t.Artists))
		for j, a := range t.Artists {
			names[j] = a.Name
		}
		cands[i] = candidate{strings.Join(names, " "), t.Name, safeURL(t.ExternalURLs.Spotify, "open.spotify.com")}
	}
	return found(Spotify, pick(q, cands)), nil
}

// accessToken reaproveita o token até um minuto antes de vencer (1 h).
func (s *spotify) accessToken(ctx context.Context) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.token != "" && time.Now().Before(s.expires) {
		return s.token, nil
	}
	form := url.Values{"grant_type": {"client_credentials"}}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.accounts+"/api/token", strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.SetBasicAuth(s.id, s.secret)
	var body struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := getJSON(ctx, s.client, req, &body); err != nil {
		return "", err
	}
	s.token = body.AccessToken
	s.expires = time.Now().Add(time.Duration(body.ExpiresIn)*time.Second - time.Minute)
	return s.token, nil
}

package musiclinks

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

var elis = Query{Artist: "Elis Regina", Title: "Águas de Março"}

func jsonServer(t *testing.T, handler func(w http.ResponseWriter, r *http.Request)) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(handler))
	t.Cleanup(srv.Close)
	return srv
}

func TestITunesFindsMatchingTrack(t *testing.T) {
	srv := jsonServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("term") != "Elis Regina Águas de Março" || r.URL.Query().Get("entity") != "song" {
			t.Errorf("query = %v", r.URL.Query())
		}
		_, _ = w.Write([]byte(`{"results":[
			{"trackName":"Como Nossos Pais","artistName":"Elis Regina","trackViewUrl":"https://music.apple.com/br/album/x/1?i=2"},
			{"trackName":"Águas de Março","artistName":"Elis Regina & Antônio Carlos Jobim","trackViewUrl":"https://music.apple.com/br/album/aguas/1438430508?i=1438430509&uo=4"}]}`))
	})
	links, err := (&itunes{base: srv.URL, client: srv.Client()}).find(context.Background(), elis)
	if err != nil {
		t.Fatal(err)
	}
	if links[AppleMusic] != "https://music.apple.com/br/album/aguas/1438430508?i=1438430509&uo=4" {
		t.Fatalf("links = %v", links)
	}
}

func TestDeezerFindsMatchingTrack(t *testing.T) {
	srv := jsonServer(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":[{"title":"Águas De Março","artist":{"name":"Elis Regina"},"link":"https://www.deezer.com/track/565340102"}]}`))
	})
	links, err := (&deezer{base: srv.URL, client: srv.Client()}).find(context.Background(), elis)
	if err != nil || links[Deezer] != "https://www.deezer.com/track/565340102" {
		t.Fatalf("links = %v, err = %v", links, err)
	}
}

func TestDeezerQuotaIsAnError(t *testing.T) {
	srv := jsonServer(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"error":{"type":"Exception","message":"Quota limit exceeded","code":4}}`))
	})
	if _, err := (&deezer{base: srv.URL, client: srv.Client()}).find(context.Background(), elis); err == nil {
		t.Fatal("cota estourada tem que ser erro (não fica no cache longo)")
	}
}

func TestSourcesIgnoreResultsThatDoNotMatch(t *testing.T) {
	srv := jsonServer(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":[{"title":"Águas de Março","artist":{"name":"Tom Jobim"},"link":"https://www.deezer.com/track/9"}]}`))
	})
	links, err := (&deezer{base: srv.URL, client: srv.Client()}).find(context.Background(), elis)
	if err != nil || len(links) != 0 {
		t.Fatalf("links = %v, err = %v; want nenhum", links, err)
	}
}

func TestSourcesHTTPErrorIsAnError(t *testing.T) {
	srv := jsonServer(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusServiceUnavailable) })
	if _, err := (&itunes{base: srv.URL, client: srv.Client()}).find(context.Background(), elis); err == nil {
		t.Fatal("503 é erro")
	}
}

func TestSpotifyUsesClientCredentialsAndCachesToken(t *testing.T) {
	var tokens atomic.Int32
	srv := jsonServer(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/token":
			if id, secret, ok := r.BasicAuth(); !ok || id != "id" || secret != "segredo" {
				t.Errorf("basic auth = %v %v %v", id, secret, ok)
			}
			if err := r.ParseForm(); err != nil || r.PostForm.Get("grant_type") != "client_credentials" {
				t.Errorf("form = %v", r.PostForm)
			}
			tokens.Add(1)
			_, _ = w.Write([]byte(`{"access_token":"tk","expires_in":3600}`))
		case "/v1/search":
			if r.Header.Get("Authorization") != "Bearer tk" || r.URL.Query().Get("type") != "track" {
				t.Errorf("auth = %q, query = %v", r.Header.Get("Authorization"), r.URL.Query())
			}
			if q := r.URL.Query().Get("q"); !strings.Contains(q, `track:"Águas de Março"`) || !strings.Contains(q, `artist:"Elis Regina"`) {
				t.Errorf("q = %q", q)
			}
			_, _ = w.Write([]byte(`{"tracks":{"items":[{"name":"Águas de Março","artists":[{"name":"Elis Regina"},{"name":"Tom Jobim"}],"external_urls":{"spotify":"https://open.spotify.com/track/abc"}}]}}`))
		}
	})
	s := &spotify{accounts: srv.URL, api: srv.URL, id: "id", secret: "segredo", client: srv.Client()}
	for range 2 {
		links, err := s.find(context.Background(), elis)
		if err != nil || links[Spotify] != "https://open.spotify.com/track/abc" {
			t.Fatalf("links = %v, err = %v", links, err)
		}
	}
	if tokens.Load() != 1 {
		t.Fatalf("tokens pedidos = %d, want 1", tokens.Load())
	}
}

func TestSpotifyForbiddenIsAnError(t *testing.T) {
	srv := jsonServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/token" {
			_, _ = w.Write([]byte(`{"access_token":"tk","expires_in":3600}`))
			return
		}
		w.WriteHeader(http.StatusForbidden)
	})
	s := &spotify{accounts: srv.URL, api: srv.URL, id: "id", secret: "segredo", client: srv.Client()}
	if _, err := s.find(context.Background(), elis); err == nil {
		t.Fatal("403 é erro")
	}
}

type fakeVideos struct {
	videos []Video
	err    error
	query  string
}

func (f *fakeVideos) FindVideos(_ context.Context, q string) ([]Video, error) {
	f.query = q
	return f.videos, f.err
}

func TestYouTubeLinksTheFirstMatchingVideo(t *testing.T) {
	v := &fakeVideos{videos: []Video{
		{ID: "outroxxxxxx", Title: "Como Nossos Pais", Channel: "Elis Regina"},
		{ID: "FI1b9RK10JI", Title: `Elis Regina - "Águas de Março" - MPB Especial`, Channel: "Trama"},
	}}
	links, err := (&youtube{videos: v}).find(context.Background(), elis)
	if err != nil {
		t.Fatal(err)
	}
	if v.query != "Elis Regina - Águas de Março" {
		t.Fatalf("busca = %q (tem que ser a mesma do enqueue, para usar o cache)", v.query)
	}
	if links[YouTube] != "https://www.youtube.com/watch?v=FI1b9RK10JI" || links[YouTubeMusic] != "https://music.youtube.com/watch?v=FI1b9RK10JI" {
		t.Fatalf("links = %v", links)
	}
}

func TestYouTubeErrorIsPassedOn(t *testing.T) {
	boom := errors.New("yt-dlp caiu")
	if _, err := (&youtube{videos: &fakeVideos{err: boom}}).find(context.Background(), elis); !errors.Is(err, boom) {
		t.Fatalf("err = %v", err)
	}
}

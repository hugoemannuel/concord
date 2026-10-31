package user

// Fakes e ambiente HTTP dos testes do perfil (profile_handler_test.go e
// vizinhos).

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"gin-quickstart/backend/internal/cosmetics"
	"gin-quickstart/backend/internal/platform/media"
	"gin-quickstart/backend/internal/relationship"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

const meID = "11111111-1111-4111-8111-111111111111"
const otherID = "22222222-2222-4222-8222-222222222222"

type fakeProfileRepo struct {
	users map[string]*User
}

func (r *fakeProfileRepo) find(id string) (*User, error) {
	u, ok := r.users[id]
	if !ok {
		return nil, pgx.ErrNoRows
	}
	return u, nil
}

func (r *fakeProfileRepo) FindByID(_ context.Context, id string) (*User, error) {
	u, err := r.find(id)
	if err != nil {
		return nil, err
	}
	copied := *u
	return &copied, nil
}

func (r *fakeProfileRepo) UpdateProfile(_ context.Context, id string, in ProfileInput) (*User, error) {
	u, err := r.find(id)
	if err != nil {
		return nil, err
	}
	u.DisplayName, u.Pronouns, u.Bio, u.StatusText = in.DisplayName, in.Pronouns, in.Bio, in.StatusText
	u.BannerColor, u.Links = in.BannerColor, in.Links
	if in.NameStyle != nil {
		u.NameStyle = *in.NameStyle
	}
	if in.ProfileTheme != nil {
		u.ProfileTheme = *in.ProfileTheme
	}
	copied := *u
	return &copied, nil
}

func (r *fakeProfileRepo) swap(id string, field **string, url *string) (*User, *string, error) {
	old := *field
	*field = url
	u := r.users[id]
	u.Look = cosmetics.Resolve(u.NameplateMode, u.BannerURL, u.NameplateCustomURL, u.AvatarDecorationURL)
	copied := *u
	return &copied, old, nil
}

func (r *fakeProfileRepo) SetNameplate(_ context.Context, id string, url *string) (*User, *string, error) {
	u, err := r.find(id)
	if err != nil {
		return nil, nil, err
	}
	u.NameplateMode = cosmetics.ModeAfterSet(u.NameplateMode, url)
	return r.swap(id, &u.NameplateCustomURL, url)
}

func (r *fakeProfileRepo) SetDecoration(_ context.Context, id string, url *string) (*User, *string, error) {
	u, err := r.find(id)
	if err != nil {
		return nil, nil, err
	}
	return r.swap(id, &u.AvatarDecorationURL, url)
}

func (r *fakeProfileRepo) SetNameplateMode(_ context.Context, id, mode string) (*User, error) {
	u, err := r.find(id)
	if err != nil {
		return nil, err
	}
	u.NameplateMode = mode
	got, _, err := r.swap(id, &u.NameplateCustomURL, u.NameplateCustomURL)
	return got, err
}

func (r *fakeProfileRepo) SetAvatar(_ context.Context, id string, url *string) (*User, *string, error) {
	u, err := r.find(id)
	if err != nil {
		return nil, nil, err
	}
	return r.swap(id, &u.AvatarURL, url)
}

func (r *fakeProfileRepo) SetBanner(_ context.Context, id string, url *string) (*User, *string, error) {
	u, err := r.find(id)
	if err != nil {
		return nil, nil, err
	}
	return r.swap(id, &u.BannerURL, url)
}

func (r *fakeProfileRepo) SetEntranceSound(_ context.Context, id string, url *string) (*User, *string, error) {
	u, err := r.find(id)
	if err != nil {
		return nil, nil, err
	}
	return r.swap(id, &u.EntranceSoundURL, url)
}

func (r *fakeProfileRepo) SetStatus(_ context.Context, id string, status string) (*User, error) {
	u, err := r.find(id)
	if err != nil {
		return nil, err
	}
	u.Status = status
	copied := *u
	return &copied, nil
}

type fakeEvents struct {
	published []PublicProfile
	statuses  map[string]string
}

func (e *fakeEvents) PublishUserUpdate(p PublicProfile) { e.published = append(e.published, p) }
func (e *fakeEvents) SetUserStatus(id, status string)   { e.statuses[id] = status }
func (e *fakeEvents) EffectiveStatus(id string) string {
	return EffectiveStatus(e.statuses[id], true)
}

// fakeLinks: vínculo de meID com cada pessoa; quem falta é sem vínculo.
type fakeLinks struct {
	kinds map[string]relationship.Kind
	err   error
}

func (f *fakeLinks) Between(_ context.Context, viewerID, userID string) (relationship.Kind, error) {
	if viewerID == userID {
		return relationship.Self, nil
	}
	if k, ok := f.kinds[userID]; ok {
		return k, f.err
	}
	return relationship.None, f.err
}

type fakeSpace struct{ ok bool }

func (s fakeSpace) HasRoom(int64) bool { return s.ok }

type profileEnv struct {
	router *gin.Engine
	h      *ProfileHandler
	repo   *fakeProfileRepo
	events *fakeEvents
	links  *fakeLinks
	store  *media.Store
	static *media.Store
	dir    string
}

func newProfileEnv(t *testing.T) *profileEnv {
	t.Helper()
	gin.SetMode(gin.TestMode)
	dir := t.TempDir()
	store, err := media.NewStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	static, err := media.NewStore(filepath.Join(dir, "static"))
	if err != nil {
		t.Fatal(err)
	}
	repo := &fakeProfileRepo{users: map[string]*User{
		meID:    {ID: meID, Username: "mugis", DisplayName: "Mugis", Email: "m@x.com", Status: StatusOnline, Links: []ProfileLink{}, NameplateMode: cosmetics.ModeOff},
		otherID: {ID: otherID, Username: "baal", DisplayName: "Baal", Email: "b@x.com", Status: StatusInvisible, Links: []ProfileLink{}},
	}}
	events := &fakeEvents{statuses: map[string]string{otherID: StatusInvisible}}
	// Por padrão a outra pessoa divide um servidor comigo.
	links := &fakeLinks{kinds: map[string]relationship.Kind{otherID: relationship.SharedServer}}
	h := NewProfileHandler(NewProfileService(repo, events, links), store, static, fakeSpace{ok: true})
	h.maxBytes = 1024
	router := gin.New()
	fakeAuth := func(c *gin.Context) {
		c.Set("userID", meID)
		c.Next()
	}
	ProfileRoutes(router.Group("/api"), h, fakeAuth)
	return &profileEnv{router: router, h: h, repo: repo, events: events, links: links, store: store, static: static, dir: dir}
}

func (e *profileEnv) do(t *testing.T, method, path string, body []byte, contentType string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, bytes.NewReader(body))
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	rec := httptest.NewRecorder()
	e.router.ServeHTTP(rec, req)
	return rec
}

func (e *profileEnv) upload(t *testing.T, path string, parts map[string][]byte) *httptest.ResponseRecorder {
	t.Helper()
	body := &bytes.Buffer{}
	w := multipart.NewWriter(body)
	for name, data := range parts {
		part, err := w.CreateFormFile(name, name+".bin")
		if err != nil {
			t.Fatal(err)
		}
		part.Write(data)
	}
	w.Close()
	return e.do(t, http.MethodPost, path, body.Bytes(), w.FormDataContentType())
}

func (e *profileEnv) fileCount(t *testing.T, store *media.Store) int {
	t.Helper()
	files, err := store.List()
	if err != nil {
		t.Fatal(err)
	}
	return len(files)
}

func decodeUser(t *testing.T, rec *httptest.ResponseRecorder) User {
	t.Helper()
	var u User
	if err := json.Unmarshal(rec.Body.Bytes(), &u); err != nil {
		t.Fatalf("resposta não é usuário: %s", rec.Body.String())
	}
	return u
}

func pngData() []byte { return append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{1}, 100)...) }
func gifData() []byte { return append([]byte("GIF89a"), bytes.Repeat([]byte{2}, 100)...) }
func webpData() []byte {
	return append([]byte("RIFF\x00\x00\x00\x00WEBPVP8 "), bytes.Repeat([]byte{3}, 100)...)
}

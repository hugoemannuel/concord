package expression

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

type fakeOrigins struct {
	emojis     []OriginRow
	stickers   []OriginRow
	deleted    map[string]string
	private    map[string]bool
	privateErr error
	emojisErr  error
	askedIDs   []string
}

func (f *fakeOrigins) VisibleEmojis(context.Context, []string, string) ([]OriginRow, error) {
	return f.emojis, f.emojisErr
}

func (f *fakeOrigins) VisibleStickers(context.Context, []string, string) ([]OriginRow, error) {
	return f.stickers, nil
}

func (f *fakeOrigins) DeletedEmojis(context.Context, []string) (map[string]string, error) {
	return f.deleted, nil
}

func (f *fakeOrigins) PrivateServers(_ context.Context, ids []string) (map[string]bool, error) {
	f.askedIDs = ids
	return f.private, f.privateErr
}

func TestResolveEscondeServidorPrivadoDeQuemNaoEMembro(t *testing.T) {
	icon := "icone.png"
	store := &fakeOrigins{
		emojis: []OriginRow{
			{ID: "publico", Name: "a", ServerID: "s-publico", ServerName: "Público", ServerIconURL: &icon},
			{ID: "privado", Name: "b", ServerID: "s-privado", ServerName: "Segredo", ServerIconURL: &icon},
			{ID: "membro", Name: "c", ServerID: "s-meu", ServerName: "Meu", Member: true},
		},
		stickers: []OriginRow{{ID: "stk", Name: "d", ServerID: "s-privado", ServerName: "Segredo"}},
		private:  map[string]bool{"s-privado": true, "s-meu": true},
	}
	set, err := NewResolver(store).Resolve(context.Background(), "ana", []string{"x"}, []string{"y"})
	if err != nil {
		t.Fatal(err)
	}
	byID := map[string]Resolved{}
	for _, r := range append(set.Emojis, set.Stickers...) {
		byID[r.ID] = r
	}
	if o := byID["publico"].Origin; o.ServerName != "Público" || o.Private {
		t.Errorf("público: %+v", o)
	}
	if o := byID["privado"].Origin; o.ServerName != "" || o.ServerIconURL != nil || !o.Private {
		t.Errorf("privado vazou: %+v", o)
	}
	if o := byID["stk"].Origin; o.ServerName != "" || !o.Private {
		t.Errorf("figurinha de servidor privado vazou: %+v", o)
	}
	if o := byID["membro"].Origin; o.ServerName != "Meu" || o.Private {
		t.Errorf("membro vê o próprio servidor privado: %+v", o)
	}
	raw, _ := json.Marshal(set)
	if strings.Contains(string(raw), "Segredo") {
		t.Errorf("nome privado na resposta: %s", raw)
	}
}

// Sem confirmar quem é privado, nenhum nome sai (quem é membro ainda vê).
func TestResolveFalhaAoConferirPrivadoEscondeTudo(t *testing.T) {
	store := &fakeOrigins{
		emojis: []OriginRow{
			{ID: "fora", Name: "a", ServerID: "s-fora", ServerName: "Fora"},
			{ID: "meu", Name: "b", ServerID: "s-meu", ServerName: "Meu", Member: true},
		},
		privateErr: errors.New("banco fora"),
	}
	set, err := NewResolver(store).Resolve(context.Background(), "ana", []string{"x"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if o := set.Emojis[0].Origin; o.ServerName != "" || !o.Private {
		t.Errorf("fora: %+v", o)
	}
	if o := set.Emojis[1].Origin; o.ServerName != "Meu" {
		t.Errorf("meu: %+v", o)
	}
}

func TestResolveApagadoDevolveONome(t *testing.T) {
	store := &fakeOrigins{deleted: map[string]string{"sumiu": "festa"}}
	set, err := NewResolver(store).Resolve(context.Background(), "ana", []string{"sumiu"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(set.Emojis) != 1 || set.Emojis[0].Name != "festa" || !set.Emojis[0].Deleted || set.Emojis[0].Origin != nil {
		t.Fatalf("%+v", set.Emojis)
	}
}

func TestResolveNaoPerguntaPrivadoDoProprioServidor(t *testing.T) {
	store := &fakeOrigins{emojis: []OriginRow{{ID: "meu", Name: "a", ServerID: "s-meu", ServerName: "Meu", Member: true}}}
	if _, err := NewResolver(store).Resolve(context.Background(), "ana", []string{"meu"}, nil); err != nil {
		t.Fatal(err)
	}
	if len(store.askedIDs) != 0 {
		t.Fatalf("perguntou %v", store.askedIDs)
	}
}

func TestResolveErroDoBanco(t *testing.T) {
	store := &fakeOrigins{emojisErr: errors.New("banco fora")}
	if _, err := NewResolver(store).Resolve(context.Background(), "ana", []string{"x"}, nil); err == nil {
		t.Fatal("devia devolver o erro")
	}
}

func resolveRequest(t *testing.T, h *Handler, body string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	router := gin.New()
	Routes(router.Group("/api"), h, func(c *gin.Context) { c.Set("userID", "ana") })
	req := httptest.NewRequest(http.MethodPost, "/api/expressions/resolve", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func TestHandlerResolve(t *testing.T) {
	h := NewHandler(NewResolver(&fakeOrigins{emojis: []OriginRow{{ID: "a", Name: "festa", ServerID: "s", ServerName: "Alfa"}}}))
	w := resolveRequest(t, h, `{"emoji_ids":["a"]}`)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d", w.Code)
	}
	var set ResolvedSet
	if err := json.Unmarshal(w.Body.Bytes(), &set); err != nil || len(set.Emojis) != 1 || set.Emojis[0].Origin.ServerName != "Alfa" {
		t.Fatalf("%v %s", err, w.Body.String())
	}
}

func TestHandlerResolveRecusaPedidoGrandeEInvalido(t *testing.T) {
	h := NewHandler(NewResolver(&fakeOrigins{}))
	many := `"` + strings.Repeat(`x","`, MaxResolve) + `x"`
	if w := resolveRequest(t, h, `{"emoji_ids":[`+many+`]}`); w.Code != http.StatusBadRequest {
		t.Errorf("muitos emojis: %d", w.Code)
	}
	if w := resolveRequest(t, h, `{"sticker_ids":[`+many+`]}`); w.Code != http.StatusBadRequest {
		t.Errorf("muitas figurinhas: %d", w.Code)
	}
	if w := resolveRequest(t, h, `nem json`); w.Code != http.StatusBadRequest {
		t.Errorf("inválido: %d", w.Code)
	}
}

func TestHandlerResolveErro(t *testing.T) {
	h := NewHandler(NewResolver(&fakeOrigins{emojisErr: errors.New("banco fora")}))
	if w := resolveRequest(t, h, `{"emoji_ids":["a"]}`); w.Code != http.StatusInternalServerError {
		t.Errorf("status %d", w.Code)
	}
}

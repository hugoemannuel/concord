package musiclinks

import "testing"

func TestMatches(t *testing.T) {
	q := Query{Artist: "Elis Regina", Title: "Águas de Março"}
	tests := []struct {
		name          string
		q             Query
		artist, title string
		want          bool
	}{
		{"igual sem acento e caixa", q, "elis regina", "AGUAS DE MARCO", true},
		{"dueto com o artista", q, "Elis Regina & Antônio Carlos Jobim", "Águas de Março", true},
		{"título com versão", Query{Artist: "Queen", Title: "Bohemian Rhapsody - Remastered 2011"}, "Queen", "Bohemian Rhapsody (Remastered 2011)", true},
		{"vídeo do YouTube com artista no título", q, "Trama", `Elis Regina - "Águas de Março" - MPB Especial`, true},
		{"feat. na atividade", Query{Artist: "Anitta, Becky G", Title: "Banana"}, "Anitta", "Banana", true},
		{"outro artista", q, "Tom Jobim", "Águas de Março", false},
		{"outro título", q, "Elis Regina", "Como Nossos Pais", false},
		{"palavra dentro de outra não vale", Query{Artist: "Queen", Title: "Go"}, "Queen", "Good Old-Fashioned Lover Boy", false},
		{"sem artista na atividade: só o título", Query{Title: "Águas de Março"}, "Qualquer", "Águas de Março", true},
		{"título vazio nunca bate", Query{Artist: "Elis Regina", Title: "(Ao Vivo)"}, "Elis Regina", "Outra", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := matches(tt.q, tt.artist, tt.title); got != tt.want {
				t.Fatalf("matches(%q, %q) = %v, want %v", tt.artist, tt.title, got, tt.want)
			}
		})
	}
}

func TestQuerySearchText(t *testing.T) {
	if got := (Query{Artist: " Elis Regina ", Title: " Águas de Março "}).searchText(); got != "Elis Regina - Águas de Março" {
		t.Fatalf("searchText = %q", got)
	}
	if got := (Query{Title: "Águas de Março"}).searchText(); got != "Águas de Março" {
		t.Fatalf("sem artista = %q", got)
	}
}

func TestSafeURL(t *testing.T) {
	tests := []struct {
		raw  string
		want string
	}{
		{"https://www.deezer.com/track/1", "https://www.deezer.com/track/1"},
		{"http://www.deezer.com/track/1", ""},
		{"https://evil.com/track/1", ""},
		{"https://deezer.com.evil.com/x", ""},
		{"javascript:alert(1)", ""},
	}
	for _, tt := range tests {
		if got := safeURL(tt.raw, "deezer.com"); got != tt.want {
			t.Errorf("safeURL(%q) = %q, want %q", tt.raw, got, tt.want)
		}
	}
}

func TestPickPrefersExactTitle(t *testing.T) {
	q := Query{Artist: "Queen", Title: "Bohemian Rhapsody - Remastered 2011"}
	cands := []candidate{
		{"Queen", "Bohemian Rhapsody (Operatic Section / A Cappella Mix)", "a"},
		{"Tom Jobim", "Bohemian Rhapsody", "b"},
		{"Queen", "Bohemian Rhapsody", ""}, // link recusado pelo safeURL
		{"Queen", "Bohemian Rhapsody (Remastered 2011)", "c"},
	}
	if got := pick(q, cands); got != "c" {
		t.Fatalf("pick = %q, want c", got)
	}
	if got := pick(q, cands[:1]); got != "a" {
		t.Fatalf("sem exato, o que contém: %q", got)
	}
	if got := pick(q, cands[1:3]); got != "" {
		t.Fatalf("nenhum serve: %q", got)
	}
}

func TestSearchTerm(t *testing.T) {
	q := Query{Artist: "Daft Punk, Pharrell Williams", Title: "Get Lucky (feat. Pharrell Williams) - Radio Edit"}
	if got := searchTerm(q); got != "Daft Punk Get Lucky" {
		t.Fatalf("searchTerm = %q", got)
	}
}

package musiclinks

// Conferência do resultado: só vira link direto o que bate com a faixa
// (título e primeiro artista, sem acento, caixa nem pontuação). Antes um link
// de busca certo do que uma música errada.

import (
	"net/url"
	"regexp"
	"strings"
	"unicode"
)

var (
	accents = strings.NewReplacer(
		"à", "a", "á", "a", "â", "a", "ã", "a", "ä", "a", "å", "a",
		"ç", "c", "è", "e", "é", "e", "ê", "e", "ë", "e",
		"ì", "i", "í", "i", "î", "i", "ï", "i", "ñ", "n",
		"ò", "o", "ó", "o", "ô", "o", "õ", "o", "ö", "o",
		"ù", "u", "ú", "u", "û", "u", "ü", "u", "ý", "y", "ÿ", "y",
	)
	// brackets: "(Remastered 2011)", "[Official Video]".
	brackets = regexp.MustCompile(`[(\[][^)\]]*[)\]]`)
	// artistSep: "Anitta, Becky G", "A & B", "A feat. B", "A ft. B", "A x B".
	artistSep = regexp.MustCompile(`(?i)\s*(,|&|\bfeat\.?|\bft\.?|\bx\b|\bwith\b)\s*`)
)

// normalize: minúsculas, sem acento, só letras e números separados por um espaço.
func normalize(s string) string {
	s = accents.Replace(strings.ToLower(s))
	return strings.Join(strings.FieldsFunc(s, func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsNumber(r)
	}), " ")
}

// cleanTitle: o título sem versão ("- Remastered", "(Ao Vivo)"), como veio.
func cleanTitle(title string) string {
	title, _, _ = strings.Cut(brackets.ReplaceAllString(title, " "), " - ")
	return strings.Join(strings.Fields(title), " ")
}

func coreTitle(title string) string { return normalize(cleanTitle(title)) }

// searchTerm: "artista título" sem a versão, para as buscas das APIs.
func searchTerm(q Query) string {
	return strings.TrimSpace(firstArtistRaw(q.Artist) + " " + cleanTitle(q.Title))
}

// firstArtistRaw: o primeiro artista como veio ("Anitta, Becky G" → "Anitta").
func firstArtistRaw(artist string) string {
	return strings.TrimSpace(artistSep.Split(artist, 2)[0])
}

func firstArtist(artist string) string {
	return normalize(artistSep.Split(artist, 2)[0])
}

// containsWords: want aparece em got como palavras inteiras ("go" não bate em "good").
func containsWords(got, want string) bool {
	return want != "" && strings.Contains(" "+got+" ", " "+want+" ")
}

// matches: o resultado (artista, título) é a faixa pedida?
func matches(q Query, artist, title string) bool {
	if !containsWords(normalize(title), coreTitle(q.Title)) {
		return false
	}
	want := firstArtist(q.Artist)
	if want == "" {
		return true
	}
	// No YouTube o artista costuma vir no título ("Artista - Música") e o canal é outro.
	return containsWords(normalize(artist+" "+title), want)
}

// candidate: um resultado de busca de uma fonte (link já conferido com safeURL).
type candidate struct{ artist, title, link string }

// pick: o primeiro do melhor nível: título igual com versão e tudo, título
// igual sem a versão, título que contém ("Bohemian Rhapsody" antes de
// "Bohemian Rhapsody (A Cappella Mix)"). "" = nenhum serve.
func pick(q Query, cands []candidate) string {
	full, core := normalize(q.Title), coreTitle(q.Title)
	tiers := []func(title string) bool{
		func(title string) bool { return title == full },
		func(title string) bool { return title == core },
		func(string) bool { return true },
	}
	for _, same := range tiers {
		for _, c := range cands {
			if c.link != "" && same(normalize(c.title)) && matches(q, c.artist, c.title) {
				return c.link
			}
		}
	}
	return ""
}

// found: Links de um serviço só, vazio se link == "".
func found(service, link string) Links {
	if link == "" {
		return Links{}
	}
	return Links{service: link}
}

// safeURL devolve raw só se for https num dos hosts do serviço; senão "".
func safeURL(raw string, hosts ...string) string {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" {
		return ""
	}
	for _, h := range hosts {
		if u.Host == h || strings.HasSuffix(u.Host, "."+h) {
			return raw
		}
	}
	return ""
}

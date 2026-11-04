package gifs

import "encoding/json"

// klipyResponse: GET api/v1/{app_key}/gifs/{search,trending} — result +
// data.data[] com file.{hd,md,sm,xs}.<formato>.{url,width,height,size}.
type klipyResponse struct {
	Result bool `json:"result"`
	Data   struct {
		Data []klipyItem `json:"data"`
	} `json:"data"`
}

type klipyItem struct {
	ID    json.Number                     `json:"id"`
	Slug  string                          `json:"slug"`
	Title string                          `json:"title"`
	File  map[string]map[string]klipyFile `json:"file"` // tamanho → formato → arquivo
}

type klipyFile struct {
	URL    string `json:"url"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
}

// gif devolve o arquivo .gif do primeiro tamanho que o tiver, na ordem dada.
func (k klipyItem) gif(sizes ...string) (klipyFile, bool) {
	for _, size := range sizes {
		if f, ok := k.File[size]["gif"]; ok && f.URL != "" {
			return f, true
		}
	}
	return klipyFile{}, false
}

// items converte a resposta para o formato do seletor: URL no tamanho médio
// (o equivalente do antigo downsized_medium), prévia no pequeno. As URLs vão
// como vieram (a KLIPY exige); só entram as que são mesmo da KLIPY.
func (r klipyResponse) items() []GIFItem {
	out := make([]GIFItem, 0, len(r.Data.Data))
	for _, it := range r.Data.Data {
		main, ok := it.gif("md", "hd", "sm", "xs")
		if !ok || providerOf(main.URL) != ProviderKlipy {
			continue
		}
		preview, ok := it.gif("sm", "xs", "md")
		if !ok || providerOf(preview.URL) != ProviderKlipy {
			preview = main
		}
		out = append(out, GIFItem{
			ID:         it.itemID(main.URL),
			Title:      it.Title,
			URL:        main.URL,
			PreviewURL: preview.URL,
			Width:      main.Width,
			Height:     main.Height,
			Provider:   ProviderKlipy,
		})
	}
	return out
}

// itemID: o hash da URL (o mesmo que se tira da URL de uma mensagem); sem ele,
// o slug da KLIPY e, por último, o id numérico.
func (k klipyItem) itemID(mediaURL string) string {
	if id := klipyIDFromURL(mediaURL); id != "" {
		return id
	}
	if k.Slug != "" {
		return k.Slug
	}
	return k.ID.String()
}

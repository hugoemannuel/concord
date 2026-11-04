package gifs

// Provedores de GIF conhecidos. Mensagens e favoritos antigos são do GIPHY;
// tudo novo é da KLIPY (docs/adr/0053-klipy-no-lugar-do-giphy.md).
const (
	ProviderGiphy = "giphy"
	ProviderKlipy = "klipy"
)

// GIFItem é o GIF como o seletor e os favoritos o conhecem. O Provider só
// viaja quando se sabe (favoritos); os apps antigos ignoram o campo extra.
type GIFItem struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	URL        string `json:"url"`
	PreviewURL string `json:"preview_url"`
	Width      int    `json:"width"`
	Height     int    `json:"height"`
	Provider   string `json:"provider,omitempty"`
}

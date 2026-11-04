package gifs

type GIFItem struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	URL        string `json:"url"`
	PreviewURL string `json:"preview_url"`
	Width      int    `json:"width"`
	Height     int    `json:"height"`
}

type GiphyAPIResponse struct {
	Data []struct {
		ID     string `json:"id"`
		Title  string `json:"title"`
		Images struct {
			Original struct {
				URL    string `json:"url"`
				Width  string `json:"width"`
				Height string `json:"height"`
			} `json:"original"`
			FixedHeight struct {
				URL    string `json:"url"`
				Width  string `json:"width"`
				Height string `json:"height"`
			} `json:"fixed_height"`
			DownsizedMedium struct {
				URL    string `json:"url"`
				Width  string `json:"width"`
				Height string `json:"height"`
			} `json:"downsized_medium"`
		} `json:"images"`
	} `json:"data"`
}

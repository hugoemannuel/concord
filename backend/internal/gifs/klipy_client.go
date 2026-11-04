package gifs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

// ErrUnavailable: a KLIPY não respondeu direito (falha de rede, status
// diferente de 200, corpo inválido). O handler vira 503.
var ErrUnavailable = errors.New("gifs: provedor indisponível")

const (
	klipyBaseURL = "https://api.klipy.com"
	// Parâmetros fixos (docs.klipy.com/gifs-api/gifs-search-api):
	klipyLocale        = "br"   // país do usuário (ISO 3166 alfa-2): resultados em português
	klipyContentFilter = "high" // o mais restrito: equivale ao antigo rating=g do GIPHY
	klipyFormatFilter  = "gif"  // só GIF: o chat guarda a URL do .gif
	klipyMinPerPage    = 8
	klipyMaxPerPage    = 50
	klipyDefaultLimit  = 25
)

// KlipyClient fala com a API da KLIPY. Só a usa o proxy opcional para apps
// antigos (Handler.Trending/Search): os apps atuais chamam a KLIPY direto.
type KlipyClient struct {
	appKey     string
	baseURL    string
	httpClient *http.Client
}

func NewKlipyClient(appKey string) *KlipyClient {
	return &KlipyClient{
		appKey:     appKey,
		baseURL:    klipyBaseURL,
		httpClient: &http.Client{Timeout: 8 * time.Second},
	}
}

func (c *KlipyClient) Trending(ctx context.Context, limit, offset int, customerID string) ([]GIFItem, error) {
	return c.fetch(ctx, "trending", "", limit, offset, customerID)
}

func (c *KlipyClient) Search(ctx context.Context, query string, limit, offset int, customerID string) ([]GIFItem, error) {
	return c.fetch(ctx, "search", query, limit, offset, customerID)
}

// pageOf converte o limit/offset dos apps antigos para per_page/page da KLIPY
// (per_page entre 8 e 50).
func pageOf(limit, offset int) (perPage, page int) {
	perPage = limit
	if perPage <= 0 {
		perPage = klipyDefaultLimit
	}
	perPage = min(max(perPage, klipyMinPerPage), klipyMaxPerPage)
	return perPage, max(offset, 0)/perPage + 1
}

func (c *KlipyClient) fetch(ctx context.Context, route, query string, limit, offset int, customerID string) ([]GIFItem, error) {
	perPage, page := pageOf(limit, offset)
	params := url.Values{
		"page":           {strconv.Itoa(page)},
		"per_page":       {strconv.Itoa(perPage)},
		"locale":         {klipyLocale},
		"content_filter": {klipyContentFilter},
		"format_filter":  {klipyFormatFilter},
	}
	if route == "search" {
		params.Set("q", query)
	}
	if customerID != "" {
		params.Set("customer_id", customerID)
	}
	endpoint := fmt.Sprintf("%s/api/v1/%s/gifs/%s?%s", c.baseURL, url.PathEscape(c.appKey), route, params.Encode())

	var parsed klipyResponse
	if err := c.getJSON(ctx, endpoint, &parsed); err != nil {
		return nil, err
	}
	if !parsed.Result {
		log.Printf("[gifs] klipy respondeu result=false")
		return nil, ErrUnavailable
	}
	return parsed.items(), nil
}

// getJSON faz o GET e decodifica o corpo. A chave da KLIPY vai no caminho da
// URL e o *url.Error do Go repete a URL inteira: por isso o log leva só a causa
// (`uerr.Err`) e nunca o erro cru.
func (c *KlipyClient) getJSON(ctx context.Context, endpoint string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		log.Printf("[gifs] klipy: montar requisição falhou")
		return ErrUnavailable
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		log.Printf("[gifs] klipy: requisição falhou: %v", withoutURL(err))
		return ErrUnavailable
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		log.Printf("[gifs] klipy: status %d", resp.StatusCode)
		return ErrUnavailable
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		log.Printf("[gifs] klipy: corpo inválido: %v", err)
		return ErrUnavailable
	}
	return nil
}

func withoutURL(err error) error {
	var uerr *url.Error
	if errors.As(err, &uerr) {
		return uerr.Err
	}
	return err
}

package gifs

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
)

// Config: o que o servidor sabe da KLIPY, vindo do ambiente.
type Config struct {
	// AppKey é a KLIPY_API_KEY (Partner Panel da KLIPY). Vazia = GIFs indisponíveis.
	AppKey string
	// Proxy liga as rotas /gifs/trending e /gifs/search para os apps antigos
	// (KLIPY_PROXY_SERVIDOR=1). A KLIPY proíbe chamar pelo servidor sem
	// aprovação escrita (docs/adr/0053): só ligue depois dela.
	Proxy bool
}

// Service reúne o que o servidor faz com a KLIPY: entregar a configuração
// aos apps (que chamam a KLIPY direto) e, se aprovado, o proxy legado.
type Service struct {
	client *KlipyClient
	appKey string
	proxy  bool
}

func NewService(cfg Config) *Service {
	s := &Service{appKey: cfg.AppKey, proxy: cfg.Proxy}
	if cfg.AppKey != "" {
		s.client = NewKlipyClient(cfg.AppKey)
	}
	return s
}

func (s *Service) Available() bool { return s.appKey != "" }

// ProxyEnabled: o proxy legado só existe com chave e com a aprovação ligada.
func (s *Service) ProxyEnabled() bool { return s.Available() && s.proxy }

// CustomerID é o customer_id da KLIPY: um hash estável por pessoa (HMAC com a
// própria chave), então a KLIPY reconhece quem volta sem saber quem é.
func (s *Service) CustomerID(userID string) string {
	mac := hmac.New(sha256.New, []byte(s.appKey))
	mac.Write([]byte("klipy-customer:" + userID))
	return hex.EncodeToString(mac.Sum(nil))[:32]
}

func (s *Service) Trending(ctx context.Context, userID string, limit, offset int) ([]GIFItem, error) {
	return s.client.Trending(ctx, limit, offset, s.CustomerID(userID))
}

func (s *Service) Search(ctx context.Context, userID, query string, limit, offset int) ([]GIFItem, error) {
	return s.client.Search(ctx, query, limit, offset, s.CustomerID(userID))
}

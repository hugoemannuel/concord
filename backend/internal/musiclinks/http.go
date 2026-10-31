package musiclinks

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// maxBody: as respostas de busca têm poucos KB; nada de ler sem limite.
const maxBody = 1 << 20

// getJSON faz a requisição e decodifica a resposta 200 em out.
func getJSON(ctx context.Context, client *http.Client, req *http.Request, out any) error {
	resp, err := client.Do(req.WithContext(ctx))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, maxBody))
		return fmt.Errorf("%s: status %d", req.URL.Host, resp.StatusCode)
	}
	return json.NewDecoder(io.LimitReader(resp.Body, maxBody)).Decode(out)
}

func get(ctx context.Context, client *http.Client, rawURL string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return err
	}
	return getJSON(ctx, client, req, out)
}

package hoststats

import (
	"bufio"
	"bytes"
	"strconv"
	"strings"
)

// parseMemUsed: 100 × (total − disponível) / total.
func parseMemUsed(meminfo []byte) (float64, error) {
	values := map[string]float64{}
	scanner := bufio.NewScanner(bytes.NewReader(meminfo))
	for scanner.Scan() {
		key, rest, ok := strings.Cut(scanner.Text(), ":")
		if !ok {
			continue
		}
		if v, err := strconv.ParseFloat(strings.Fields(rest + " 0")[0], 64); err == nil {
			values[key] = v
		}
	}
	total, available := values["MemTotal"], values["MemAvailable"]
	if total <= 0 {
		return 0, errFormat
	}
	return (total - available) * 100 / total, nil
}

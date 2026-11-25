package apperrors

import (
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"sort"
	"strings"
)

// Leitor de source map v3 (ECMA-426, https://tc39.es/ecma426/), só o que a
// tradução da pilha usa: version, sources, names e mappings (o sourcesContent
// nem é lido; o build do app nem o gera). mappings: uma linha gerada por ";",
// segmentos por ",", cada segmento com 1, 4 ou 5 campos em base64 VLQ. A
// coluna gerada é relativa ao segmento anterior da mesma linha; fonte, linha,
// coluna de origem e nome, ao segmento anterior do arquivo inteiro.

var errBadVLQ = errors.New("mappings inválido")

// segment: posições 0-based; src = -1 quando o segmento não tem origem.
type segment struct {
	genCol, src, line, col, name int32
}

// SourceMap decodificado (um mapa por arquivo .js do build).
type SourceMap struct {
	sources []string
	names   []string
	lines   [][]segment
}

type rawSourceMap struct {
	Version  int      `json:"version"`
	Sources  []string `json:"sources"`
	Names    []string `json:"names"`
	Mappings string   `json:"mappings"`
}

// ParseSourceMap lê o JSON do .map.
func ParseSourceMap(data []byte) (*SourceMap, error) {
	var raw rawSourceMap
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("source map: %w", err)
	}
	if raw.Version != 3 {
		return nil, fmt.Errorf("source map: versão %d", raw.Version)
	}
	lines, err := decodeMappings(raw.Mappings)
	if err != nil {
		return nil, fmt.Errorf("source map: %w", err)
	}
	return &SourceMap{sources: raw.Sources, names: raw.Names, lines: lines}, nil
}

// Lookup: linha e coluna da pilha (1-based) → arquivo de origem, linha e
// coluna (1-based) e o nome original, se houver. Vale o último segmento da
// linha que começa na coluna ou antes dela.
func (m *SourceMap) Lookup(line, col int) (source string, srcLine, srcCol int, name string, ok bool) {
	if line < 1 || line > len(m.lines) {
		return "", 0, 0, "", false
	}
	segs := m.lines[line-1]
	i := sort.Search(len(segs), func(i int) bool { return int(segs[i].genCol) > col-1 })
	if i == 0 {
		return "", 0, 0, "", false
	}
	s := segs[i-1]
	if s.src < 0 || int(s.src) >= len(m.sources) {
		return "", 0, 0, "", false
	}
	return m.sources[s.src], int(s.line) + 1, int(s.col) + 1, m.name(s.name), true
}

func (m *SourceMap) name(i int32) string {
	if i < 0 || int(i) >= len(m.names) {
		return ""
	}
	return m.names[i]
}

// carry: os campos que seguem de um segmento para o próximo no arquivo todo.
type carry struct {
	src, line, col, name int32
}

func decodeMappings(s string) ([][]segment, error) {
	var st carry
	var lines [][]segment
	for line := range strings.SplitSeq(s, ";") {
		segs, err := decodeLine(line, &st)
		if err != nil {
			return nil, err
		}
		lines = append(lines, segs)
	}
	return lines, nil
}

func decodeLine(line string, st *carry) ([]segment, error) {
	var segs []segment
	var genCol int32
	for field := range strings.SplitSeq(line, ",") {
		if field == "" {
			continue
		}
		values, err := decodeVLQs(field)
		if err != nil {
			return nil, err
		}
		seg, err := st.apply(values, &genCol)
		if err != nil {
			return nil, err
		}
		segs = append(segs, seg)
	}
	slices.SortStableFunc(segs, func(a, b segment) int { return int(a.genCol - b.genCol) })
	return segs, nil
}

func (st *carry) apply(v []int32, genCol *int32) (segment, error) {
	*genCol += v[0]
	switch len(v) {
	case 1:
		return segment{genCol: *genCol, src: -1, name: -1}, nil
	case 4, 5:
		st.src += v[1]
		st.line += v[2]
		st.col += v[3]
		name := int32(-1)
		if len(v) == 5 {
			st.name += v[4]
			name = st.name
		}
		return segment{genCol: *genCol, src: st.src, line: st.line, col: st.col, name: name}, nil
	}
	return segment{}, fmt.Errorf("%w: segmento com %d campos", errBadVLQ, len(v))
}

const base64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

// decodeVLQs: os números de um segmento. Cada dígito base64 traz 5 bits
// (o 6º diz "continua"); o bit mais baixo do número é o sinal.
func decodeVLQs(field string) ([]int32, error) {
	var out []int32
	var value, shift int64
	for i := 0; i < len(field); i++ {
		digit := int64(strings.IndexByte(base64Chars, field[i]))
		if digit < 0 || shift > 30 {
			return nil, fmt.Errorf("%w: %q", errBadVLQ, field)
		}
		value |= (digit & 31) << shift
		if digit&32 != 0 {
			shift += 5
			continue
		}
		out = append(out, vlqSign(value))
		value, shift = 0, 0
	}
	if shift != 0 {
		return nil, fmt.Errorf("%w: %q cortado", errBadVLQ, field)
	}
	return out, nil
}

func vlqSign(v int64) int32 {
	if v&1 != 0 {
		return int32(-(v >> 1))
	}
	return int32(v >> 1)
}

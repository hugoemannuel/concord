package changelog

import (
	"strconv"
	"strings"
)

// Versão obrigatória (ADR 0066): uma release é obrigatória se alguma nota nova
// dela veio de um arquivo com "obrigatoria: true". Quem tem versão anterior à
// maior obrigatória precisa atualizar para continuar.

// anyRequired diz se alguma das notas (já sem as publicadas antes) é obrigatória.
func anyRequired(entries []Entry) bool {
	for _, e := range entries {
		if e.Required {
			return true
		}
	}
	return false
}

// requiredVersion devolve a maior versão obrigatória ("" se nenhuma). As
// releases vêm por data; a versão é comparada número a número.
func requiredVersion(releases []Release) string {
	best := ""
	for _, r := range releases {
		if r.Required && (best == "" || compareVersions(r.Version, best) > 0) {
			best = r.Version
		}
	}
	return best
}

// compareVersions compara "x.y.z" número a número (0.10.0 > 0.9.9). As versões
// já passaram pelo versionRe no PUT.
func compareVersions(a, b string) int {
	pa, pb := strings.Split(a, "."), strings.Split(b, ".")
	for i := 0; i < len(pa) && i < len(pb); i++ {
		x, _ := strconv.Atoi(pa[i])
		y, _ := strconv.Atoi(pb[i])
		if x != y {
			return x - y
		}
	}
	return len(pa) - len(pb)
}

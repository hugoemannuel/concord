package apperrors

import (
	"cmp"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
)

// Montagem do painel (funções puras): ordem das versões por semver e o selo
// "novo nesta versão".

var reSemver = regexp.MustCompile(`^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$`)

type semver struct {
	nums [3]int
	pre  string
}

func parseSemver(s string) (semver, bool) {
	m := reSemver.FindStringSubmatch(s)
	if m == nil {
		return semver{}, false
	}
	var v semver
	for i := range v.nums {
		v.nums[i], _ = strconv.Atoi(m[i+1])
	}
	v.pre = m[4]
	return v, true
}

// compareVersions > 0 quando a é mais nova que b. Semver vem antes de
// qualquer texto que não é semver; entre esses, a ordem do texto.
func compareVersions(a, b string) int {
	va, okA := parseSemver(a)
	vb, okB := parseSemver(b)
	switch {
	case okA && okB:
		return va.compare(vb)
	case okA:
		return 1
	case okB:
		return -1
	}
	return strings.Compare(a, b)
}

func (a semver) compare(b semver) int {
	for i := range a.nums {
		if c := cmp.Compare(a.nums[i], b.nums[i]); c != 0 {
			return c
		}
	}
	return comparePre(a.pre, b.pre)
}

// comparePre: sem pré-lançamento é mais nova; senão, identificador a
// identificador (número < texto; mais identificadores ganha no empate).
func comparePre(a, b string) int {
	if a == "" || b == "" {
		return cmp.Compare(len(b), len(a))
	}
	as, bs := strings.Split(a, "."), strings.Split(b, ".")
	for i := range min(len(as), len(bs)) {
		if c := compareIdent(as[i], bs[i]); c != 0 {
			return c
		}
	}
	return cmp.Compare(len(as), len(bs))
}

func compareIdent(a, b string) int {
	na, errA := strconv.Atoi(a)
	nb, errB := strconv.Atoi(b)
	switch {
	case errA == nil && errB == nil:
		return cmp.Compare(na, nb)
	case errA == nil:
		return -1
	case errB == nil:
		return 1
	}
	return strings.Compare(a, b)
}

// sortVersionsDesc: cópia da mais nova para a mais velha (empate: ordem do texto).
func sortVersionsDesc(versions []string) []string {
	out := slices.Clone(versions)
	slices.SortStableFunc(out, func(a, b string) int {
		if c := compareVersions(b, a); c != 0 {
			return c
		}
		return strings.Compare(a, b)
	})
	if out == nil {
		out = []string{}
	}
	return out
}

// groupVersions: as versões de todas as ocorrências de um grupo (retenção inteira).
type groupVersions struct {
	Source      string
	Fingerprint string
	Versions    []string
}

// markNewInVersion: o grupo é "novo nesta versão" quando todas as ocorrências
// dele são da versão mais nova vista naquela origem (sem versão não conta).
func markNewInVersion(groups []GroupSummary, index []groupVersions) {
	newest := newestBySource(index)
	byGroup := make(map[string][]string, len(index))
	for _, g := range index {
		byGroup[g.Fingerprint] = g.Versions
	}
	for i := range groups {
		g := &groups[i]
		g.NewInVersion = onlyVersion(byGroup[g.Fingerprint], newest[g.Source])
	}
}

func newestBySource(index []groupVersions) map[string]string {
	all := map[string][]string{}
	for _, g := range index {
		all[g.Source] = append(all[g.Source], g.Versions...)
	}
	newest := make(map[string]string, len(all))
	for source, versions := range all {
		newest[source] = sortVersionsDesc(versions)[0]
	}
	return newest
}

func onlyVersion(versions []string, newest string) bool {
	if newest == "" || len(versions) == 0 {
		return false
	}
	for _, v := range versions {
		if v != newest {
			return false
		}
	}
	return true
}

// buildReport: o GET /obs/errors, com as versões em ordem e listas nunca nulas.
func buildReport(from, to time.Time, versions []string, groups []GroupSummary, index []groupVersions) ErrorsReport {
	if groups == nil {
		groups = []GroupSummary{}
	}
	for i := range groups {
		fillLists(&groups[i])
	}
	markNewInVersion(groups, index)
	return ErrorsReport{From: from, To: to, Versions: sortVersionsDesc(versions), Groups: groups}
}

func fillLists(g *GroupSummary) {
	g.Versions = sortVersionsDesc(g.Versions)
	if g.Systems == nil {
		g.Systems = []string{}
	}
	if g.Targets == nil {
		g.Targets = []string{}
	}
}

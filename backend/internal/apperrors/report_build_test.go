package apperrors

import (
	"reflect"
	"testing"
	"time"
)

func TestSortVersionsDesc(t *testing.T) {
	got := sortVersionsDesc([]string{"1.4.1", "dev", "1.10.0", "v1.4.2", "1.4.2-beta.2", "1.4.2-beta.10", "1.4.2-alpha", "1.4.2-1", "abc", "1.4.2", "1.4"})
	want := []string{"1.10.0", "1.4.2", "v1.4.2", "1.4.2-beta.10", "1.4.2-beta.2", "1.4.2-alpha", "1.4.2-1", "1.4.1", "dev", "abc", "1.4"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("ordem\n got %v\nwant %v", got, want)
	}
}

func TestCompareVersions(t *testing.T) {
	tests := []struct {
		a, b string
		want int
	}{
		{"1.4.2", "1.4.1", 1},
		{"1.4.1", "1.4.2", -1},
		{"2.0.0", "10.0.0", -1},
		{"1.4.2", "1.4.2+build.7", 0},
		{"1.4.2", "1.4.2-rc.1", 1},
		{"1.4.2-rc.1", "1.4.2-rc.1.1", -1},
		{"1.4.2-rc.1.1", "1.4.2-rc.1", 1},
		{"1.0.0-2", "1.0.0-10", -1},
		{"1.0.0-alpha", "1.0.0-1", 1},
		{"1.0.0-1", "1.0.0-alpha", -1},
		{"1.0.0", "nightly", 1},
		{"nightly", "1.0.0", -1},
	}
	for _, tt := range tests {
		if got := sign(compareVersions(tt.a, tt.b)); got != tt.want {
			t.Errorf("compareVersions(%q, %q) = %d, quer %d", tt.a, tt.b, got, tt.want)
		}
	}
}

func sign(n int) int {
	return max(-1, min(n, 1))
}

func TestMarkNewInVersion(t *testing.T) {
	groups := []GroupSummary{
		{Fingerprint: "so-na-nova", Source: SourceRenderer},
		{Fingerprint: "nova-e-velha", Source: SourceRenderer},
		{Fingerprint: "so-na-velha", Source: SourceRenderer},
		{Fingerprint: "mobile-nova", Source: SourceMobile},
		{Fingerprint: "backend", Source: SourceBackend},
		{Fingerprint: "sem-indice", Source: SourceMain},
	}
	index := []groupVersions{
		{SourceRenderer, "so-na-nova", []string{"1.4.2"}},
		{SourceRenderer, "nova-e-velha", []string{"1.4.1", "1.4.2"}},
		{SourceRenderer, "so-na-velha", []string{"1.4.1"}},
		{SourceMobile, "mobile-nova", []string{"0.3.0"}},
		{SourceMobile, "outro-mobile", []string{"0.2.0"}},
		{SourceBackend, "backend", []string{""}},
	}
	markNewInVersion(groups, index)
	want := map[string]bool{"so-na-nova": true, "mobile-nova": true}
	for _, g := range groups {
		if g.NewInVersion != want[g.Fingerprint] {
			t.Errorf("%s: new_in_version = %v", g.Fingerprint, g.NewInVersion)
		}
	}
}

func TestBuildReportNuncaMandaNull(t *testing.T) {
	from, to := t0.Add(-time.Hour), t0
	r := buildReport(from, to, nil, nil, nil)
	if r.Versions == nil || r.Groups == nil || !r.From.Equal(from) || !r.To.Equal(to) {
		t.Errorf("relatório vazio = %+v", r)
	}
	r = buildReport(from, to, []string{"1.0.0", "1.2.0"}, []GroupSummary{{Fingerprint: "a", Versions: []string{"1.0.0", "1.2.0"}}}, nil)
	g := r.Groups[0]
	if !reflect.DeepEqual(r.Versions, []string{"1.2.0", "1.0.0"}) || !reflect.DeepEqual(g.Versions, []string{"1.2.0", "1.0.0"}) {
		t.Errorf("versões fora de ordem: %v / %v", r.Versions, g.Versions)
	}
	if g.Systems == nil || g.Targets == nil {
		t.Errorf("listas do grupo nulas: %+v", g)
	}
}

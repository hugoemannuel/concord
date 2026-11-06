package expression

import (
	"errors"
	"reflect"
	"testing"
)

type testGroup struct {
	ServerID string
	Items    []string
}

var byTestServer = Grouping[testGroup, string]{
	Key:   func(g *testGroup) string { return g.ServerID },
	Items: func(g *testGroup) *[]string { return &g.Items },
}

// fakeRows devolve as linhas (servidor, item) uma a uma.
type fakeRows struct {
	rows [][2]string
	at   int
	err  error
}

func (r *fakeRows) Next() bool {
	r.at++
	return r.at <= len(r.rows)
}

func (r *fakeRows) Err() error { return r.err }

func (r *fakeRows) scan() (testGroup, string, error) {
	row := r.rows[r.at-1]
	if row[1] == "ruim" {
		return testGroup{}, "", errors.New("scan")
	}
	return testGroup{ServerID: row[0]}, row[1], nil
}

func TestScanGroupsJuntaLinhasSeguidasDoMesmoServidor(t *testing.T) {
	rows := &fakeRows{rows: [][2]string{{"a", "1"}, {"a", "2"}, {"b", "3"}, {"a", "4"}}}
	got, err := ScanGroups(rows, rows.scan, byTestServer)
	if err != nil {
		t.Fatal(err)
	}
	want := []testGroup{{"a", []string{"1", "2"}}, {"b", []string{"3"}}, {"a", []string{"4"}}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("grupos = %+v; quer %+v", got, want)
	}
}

func TestScanGroupsSemLinhasDevolveListaVazia(t *testing.T) {
	got, err := ScanGroups(&fakeRows{}, (&fakeRows{}).scan, byTestServer)
	if err != nil || got == nil || len(got) != 0 {
		t.Fatalf("ScanGroups = %#v, %v; quer lista vazia (não nil, vira [] no JSON)", got, err)
	}
}

func TestScanGroupsRepassaOsErros(t *testing.T) {
	bad := &fakeRows{rows: [][2]string{{"a", "ruim"}}}
	if _, err := ScanGroups(bad, bad.scan, byTestServer); err == nil {
		t.Fatal("erro do scan sumiu")
	}
	failed := &fakeRows{err: errors.New("rows")}
	if _, err := ScanGroups(failed, failed.scan, byTestServer); err == nil {
		t.Fatal("erro das linhas sumiu")
	}
}

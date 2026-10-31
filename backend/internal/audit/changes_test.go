package audit

import (
	"reflect"
	"testing"
)

func TestDiff(t *testing.T) {
	var changes []Change
	changes = Diff(changes, "name", "geral", "geral")
	if len(changes) != 0 {
		t.Fatalf("igual não é mudança: %+v", changes)
	}
	changes = Diff(changes, "name", "geral", "papo")
	changes = Diff(changes, "hoist", false, true)
	want := []Change{{Field: "name", Before: "geral", After: "papo"}, {Field: "hoist", Before: false, After: true}}
	if !reflect.DeepEqual(changes, want) {
		t.Fatalf("changes = %+v, want %+v", changes, want)
	}
}

func TestDiffPtr(t *testing.T) {
	a, b := "Ana", "Aninha"
	cases := []struct {
		name          string
		before, after *string
		want          []Change
	}{
		{"nil e nil", nil, nil, nil},
		{"iguais", &a, &a, nil},
		{"pôs", nil, &a, []Change{{Field: "nick", After: "Ana"}}},
		{"tirou", &a, nil, []Change{{Field: "nick", Before: "Ana"}}},
		{"trocou", &a, &b, []Change{{Field: "nick", Before: "Ana", After: "Aninha"}}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := DiffPtr(nil, "nick", tc.before, tc.after)
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("got %+v, want %+v", got, tc.want)
			}
		})
	}
}

func TestValidAction(t *testing.T) {
	if !ValidAction(MemberKick) || ValidAction("member.explode") || ValidAction("") {
		t.Fatal("ValidAction errou")
	}
}

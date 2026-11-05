package channelcategory

import (
	"reflect"
	"testing"
)

func TestSwapCategory(t *testing.T) {
	for _, tc := range []struct {
		name, id, direction string
		want                []string
		fails               bool
	}{
		{"sobe", "b", "up", []string{"b", "a"}, false},
		{"desce", "a", "down", []string{"b", "a"}, false},
		{"limite superior", "a", "up", []string{"a", "b"}, false},
		{"limite inferior", "b", "down", []string{"a", "b"}, false},
		{"ausente", "x", "up", []string{"a", "b"}, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ids := []string{"a", "b"}
			err := swapCategory(ids, tc.id, tc.direction)
			if (err != nil) != tc.fails || !reflect.DeepEqual(ids, tc.want) {
				t.Fatalf("ids=%v erro=%v", ids, err)
			}
		})
	}
}

package permission

import (
	"encoding/json"
	"os"
	"testing"
)

// Os mesmos casos rodam no app (frontend/src/renderer/src/lib/permissions.test.ts).

type vectorOverwrite struct {
	TargetType string   `json:"target_type"`
	TargetID   string   `json:"target_id"`
	Allow      []string `json:"allow"`
	Deny       []string `json:"deny"`
}

type vectorRole struct {
	ID          string   `json:"id"`
	Position    int      `json:"position"`
	Permissions []string `json:"permissions"`
}

type vectorFile struct {
	Bits     map[string]int64 `json:"bits"`
	Defaults struct {
		Everyone []string `json:"everyone"`
	} `json:"defaults"`
	Compute []struct {
		Name        string       `json:"name"`
		OwnerID     string       `json:"owner_id"`
		UserID      string       `json:"user_id"`
		Everyone    []string     `json:"everyone"`
		Roles       []vectorRole `json:"roles"`
		MemberRoles []string     `json:"member_roles"`
		Channel     struct {
			Type       string            `json:"type"`
			Overwrites []vectorOverwrite `json:"overwrites"`
		} `json:"channel"`
		ExpectBase    []string `json:"expect_base"`
		ExpectChannel []string `json:"expect_channel"`
	} `json:"compute"`
	CategoryGate []categoryGateVector `json:"category_gate"`
	CanActOn     []struct {
		Name          string `json:"name"`
		OwnerID       string `json:"owner_id"`
		Actor         string `json:"actor"`
		Target        string `json:"target"`
		ActorHighest  int    `json:"actor_highest"`
		TargetHighest int    `json:"target_highest"`
		Expect        bool   `json:"expect"`
	} `json:"can_act_on"`
	CanManageRole []struct {
		Name         string `json:"name"`
		IsOwner      bool   `json:"is_owner"`
		ActorHighest int    `json:"actor_highest"`
		RolePosition int    `json:"role_position"`
		Expect       bool   `json:"expect"`
	} `json:"can_manage_role"`
	CanEditRolesOf []struct {
		Name    string `json:"name"`
		OwnerID string `json:"owner_id"`
		Actor   string `json:"actor"`
		Target  string `json:"target"`
		Expect  bool   `json:"expect"`
	} `json:"can_edit_roles_of"`
	CanGrant []struct {
		Name    string   `json:"name"`
		Actor   []string `json:"actor"`
		Changed []string `json:"changed"`
		Expect  bool     `json:"expect"`
	} `json:"can_grant"`
}

// categoryGateVector: quem não vê a categoria não tem nada nos canais dela.
type categoryGateVector struct {
	Name        string       `json:"name"`
	OwnerID     string       `json:"owner_id"`
	UserID      string       `json:"user_id"`
	Everyone    []string     `json:"everyone"`
	Roles       []vectorRole `json:"roles"`
	MemberRoles []string     `json:"member_roles"`
	Category    struct {
		Overwrites []vectorOverwrite `json:"overwrites"`
	} `json:"category"`
	Channel struct {
		Type       string            `json:"type"`
		Overwrites []vectorOverwrite `json:"overwrites"`
	} `json:"channel"`
	ExpectCategory bool     `json:"expect_category"`
	ExpectChannel  []string `json:"expect_channel"`
}

func loadVectors(t *testing.T) vectorFile {
	t.Helper()
	raw, err := os.ReadFile("testdata/vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var v vectorFile
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	return v
}

func bitsOf(t *testing.T, names []string) int64 {
	t.Helper()
	var perms int64
	for _, n := range names {
		if n == "ALL" {
			perms |= All
			continue
		}
		bit, ok := Names[n]
		if !ok {
			t.Fatalf("permissão desconhecida %q", n)
		}
		perms |= bit
	}
	return perms
}

func TestVectorBitsMatchConstants(t *testing.T) {
	v := loadVectors(t)
	if len(v.Bits) != len(Names) {
		t.Fatalf("vectors tem %d bits, o Go tem %d", len(v.Bits), len(Names))
	}
	for name, bit := range v.Bits {
		if Names[name] != bit {
			t.Errorf("%s: vectors = %d, Go = %d", name, bit, Names[name])
		}
	}
	if got := bitsOf(t, v.Defaults.Everyone); got != DefaultEveryone {
		t.Errorf("DefaultEveryone = %d, vectors = %d", DefaultEveryone, got)
	}
}

func TestVectorsCompute(t *testing.T) {
	for _, tc := range loadVectors(t).Compute {
		t.Run(tc.Name, func(t *testing.T) {
			snap := NewSnapshot("s1", tc.OwnerID, bitsOf(t, tc.Everyone))
			for _, r := range tc.Roles {
				snap.WithRole(r.ID, r.Position, bitsOf(t, r.Permissions))
			}
			snap.WithMember(tc.UserID, tc.MemberRoles...)
			var overwrites []Overwrite
			for _, o := range tc.Channel.Overwrites {
				overwrites = append(overwrites, Overwrite{
					TargetType: o.TargetType,
					TargetID:   o.TargetID,
					Allow:      bitsOf(t, o.Allow),
					Deny:       bitsOf(t, o.Deny),
				})
			}
			snap.WithChannel("c1", tc.Channel.Type, overwrites...)

			if got, want := snap.Server(tc.UserID), bitsOf(t, tc.ExpectBase); got != want {
				t.Errorf("base = %d, want %d", got, want)
			}
			if got, want := snap.Channel("c1", tc.UserID), bitsOf(t, tc.ExpectChannel); got != want {
				t.Errorf("canal = %d, want %d", got, want)
			}
		})
	}
}

func overwritesOf(t *testing.T, rows []vectorOverwrite) []Overwrite {
	t.Helper()
	overwrites := make([]Overwrite, 0, len(rows))
	for _, o := range rows {
		overwrites = append(overwrites, Overwrite{
			TargetType: o.TargetType,
			TargetID:   o.TargetID,
			Allow:      bitsOf(t, o.Allow),
			Deny:       bitsOf(t, o.Deny),
		})
	}
	return overwrites
}

func TestVectorsCategoryGate(t *testing.T) {
	for _, tc := range loadVectors(t).CategoryGate {
		t.Run(tc.Name, func(t *testing.T) {
			snap := NewSnapshot("s1", tc.OwnerID, bitsOf(t, tc.Everyone))
			for _, r := range tc.Roles {
				snap.WithRole(r.ID, r.Position, bitsOf(t, r.Permissions))
			}
			snap.WithMember(tc.UserID, tc.MemberRoles...)
			snap.WithCategory("cat", overwritesOf(t, tc.Category.Overwrites)...)
			snap.WithChannel("c1", tc.Channel.Type, overwritesOf(t, tc.Channel.Overwrites)...).InCategory("c1", "cat")
			if got := snap.CanViewCategory("cat", tc.UserID); got != tc.ExpectCategory {
				t.Errorf("categoria = %v, want %v", got, tc.ExpectCategory)
			}
			if got, want := snap.Channel("c1", tc.UserID), bitsOf(t, tc.ExpectChannel); got != want {
				t.Errorf("canal = %d, want %d", got, want)
			}
		})
	}
}

func TestVectorsHierarchy(t *testing.T) {
	v := loadVectors(t)
	for _, tc := range v.CanActOn {
		if got := CanActOn(tc.OwnerID, tc.Actor, tc.Target, tc.ActorHighest, tc.TargetHighest); got != tc.Expect {
			t.Errorf("CanActOn %q = %v, want %v", tc.Name, got, tc.Expect)
		}
	}
	for _, tc := range v.CanManageRole {
		if got := CanManageRole(tc.IsOwner, tc.ActorHighest, Role{Position: tc.RolePosition}); got != tc.Expect {
			t.Errorf("CanManageRole %q = %v, want %v", tc.Name, got, tc.Expect)
		}
	}
	for _, tc := range v.CanEditRolesOf {
		if got := CanEditRolesOf(tc.OwnerID, tc.Actor, tc.Target); got != tc.Expect {
			t.Errorf("CanEditRolesOf %q = %v, want %v", tc.Name, got, tc.Expect)
		}
	}
	for _, tc := range v.CanGrant {
		if got := CanGrant(bitsOf(t, tc.Actor), bitsOf(t, tc.Changed)); got != tc.Expect {
			t.Errorf("CanGrant %q = %v, want %v", tc.Name, got, tc.Expect)
		}
	}
}

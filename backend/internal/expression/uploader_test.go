package expression

import (
	"context"
	"errors"
	"testing"

	"gin-quickstart/backend/internal/permission"
)

// fakeUploaderDeps responde as três consultas da checagem de quem envia.
type fakeUploaderDeps struct {
	member              bool
	memberErr, permsErr error
	perms               int64
	count               int
	countErr            error
}

func (f fakeUploaderDeps) IsMember(context.Context, string, string) (bool, error) {
	return f.member, f.memberErr
}

func (f fakeUploaderDeps) ServerPerms(context.Context, string, string) (int64, error) {
	return f.perms, f.permsErr
}

func (f fakeUploaderDeps) CountByServer(context.Context, string) (int, error) {
	return f.count, f.countErr
}

var uploaderAnswers = UploaderErrors[string]{
	MemberCheck: "member check", NotMember: "not member", PermsCheck: "perms check",
	MissingPermission: "missing permission", CountCheck: "count check", Full: "full",
}

func TestCheckUploader(t *testing.T) {
	boom := errors.New("boom")
	ok := fakeUploaderDeps{member: true, perms: permission.AddEmojis, count: 1}
	cases := []struct {
		name string
		deps fakeUploaderDeps
		want string
	}{
		{"pode enviar", ok, ""},
		{"falha ao ver membro", fakeUploaderDeps{memberErr: boom}, "member check"},
		{"não é membro", fakeUploaderDeps{}, "not member"},
		{"falha ao ver cargos", fakeUploaderDeps{member: true, permsErr: boom}, "perms check"},
		{"sem a permissão", fakeUploaderDeps{member: true, perms: permission.AddStickers}, "missing permission"},
		{"falha ao contar", fakeUploaderDeps{member: true, perms: permission.AddEmojis, countErr: boom}, "count check"},
		{"servidor cheio", fakeUploaderDeps{member: true, perms: permission.AddEmojis, count: 2}, "full"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			u := Uploader{Members: tc.deps, Perms: tc.deps, Counter: tc.deps, Permission: permission.AddEmojis, Max: 2}
			if got := CheckUploader(context.Background(), u, "s", "u", uploaderAnswers); got != tc.want {
				t.Fatalf("CheckUploader = %q; quer %q", got, tc.want)
			}
		})
	}
}

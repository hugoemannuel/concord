package expression

import (
	"context"
	"errors"
	"slices"
	"testing"

	"gin-quickstart/backend/internal/permission"
)

const (
	emojiLocal  = "11111111-1111-4111-8111-111111111111"
	emojiFora   = "22222222-2222-4222-8222-222222222222"
	emojiEstran = "33333333-3333-4333-8333-333333333333"
	emojiSumiu  = "44444444-4444-4444-8444-444444444444"
)

type fakeStore struct {
	emojis    map[string]EmojiRef
	stickers  map[string]string
	published []string
	failOn    error
}

func (f *fakeStore) EmojisByID(_ context.Context, ids []string) (map[string]EmojiRef, error) {
	if f.failOn != nil {
		return nil, f.failOn
	}
	out := map[string]EmojiRef{}
	for _, id := range ids {
		if e, ok := f.emojis[id]; ok {
			out[id] = e
		}
	}
	return out, nil
}

func (f *fakeStore) StickerServer(_ context.Context, id string) (string, error) {
	if f.failOn != nil {
		return "", f.failOn
	}
	serverID, ok := f.stickers[id]
	if !ok {
		return "", ErrUnknownSticker
	}
	return serverID, nil
}

func (f *fakeStore) PublishEmojis(_ context.Context, ids []string) error {
	f.published = append(f.published, ids...)
	return nil
}

func (f *fakeStore) PublishSticker(_ context.Context, id string) error {
	f.published = append(f.published, id)
	return nil
}

// fakeAccess: ana é membro de "aqui" e de "fora", mas não de "estranho".
type fakeAccess struct {
	perms int64
}

func (f *fakeAccess) IsMember(_ context.Context, serverID, userID string) (bool, error) {
	return userID == "ana" && (serverID == "aqui" || serverID == "fora"), nil
}

func (f *fakeAccess) ChannelPerms(_ context.Context, _, _ string) (int64, error) {
	return f.perms, nil
}

func testGuard(perms int64) (*Guard, *fakeStore) {
	store := &fakeStore{
		emojis: map[string]EmojiRef{
			emojiLocal:  {Name: "local", ServerID: "aqui"},
			emojiFora:   {Name: "fora", ServerID: "fora"},
			emojiEstran: {Name: "estranho", ServerID: "estranho"},
		},
		stickers: map[string]string{"stk-local": "aqui", "stk-fora": "fora", "stk-estranho": "estranho"},
	}
	return NewGuard(store, &fakeAccess{perms: perms}), store
}

var (
	noCanal = Destination{ServerID: "aqui", ChannelID: "canal"}
	naDM    = Destination{}
)

func TestSanitizeContent(t *testing.T) {
	tests := []struct {
		name          string
		dest          Destination
		perms         int64
		content       string
		want          string
		wantPublished []string
	}{
		{name: "sem emoji não muda nada", dest: noCanal, content: "oi <: tudo bem", want: "oi <: tudo bem"},
		{
			name: "do próprio servidor passa sem pedir a permissão e não publica", dest: noCanal,
			content: "<:local:" + emojiLocal + ">", want: "<:local:" + emojiLocal + ">",
		},
		{
			name: "de outro servidor com a permissão passa e publica", dest: noCanal, perms: permission.UseExternalEmojis,
			content: "a <:fora:" + emojiFora + "> b", want: "a <:fora:" + emojiFora + "> b", wantPublished: []string{emojiFora},
		},
		{
			name: "de outro servidor sem a permissão vira texto", dest: noCanal,
			content: "a <:fora:" + emojiFora + "> b", want: "a :fora: b",
		},
		{
			name: "de servidor de que não é membro vira texto, mesmo com a permissão", dest: noCanal, perms: permission.UseExternalEmojis,
			content: "<:estranho:" + emojiEstran + ">", want: ":estranho:",
		},
		{
			name: "apagado ou inventado vira texto", dest: noCanal, perms: permission.UseExternalEmojis,
			content: "<:sumiu:" + emojiSumiu + ">", want: ":sumiu:",
		},
		{
			name: "na DM basta ser membro e publica", dest: naDM,
			content: "<:fora:" + emojiFora + ">", want: "<:fora:" + emojiFora + ">", wantPublished: []string{emojiFora},
		},
		{
			name: "na DM sem ser membro vira texto", dest: naDM,
			content: "<:estranho:" + emojiEstran + ">", want: ":estranho:",
		},
		{
			name: "o nome do token não engana: vale o nome de verdade", dest: noCanal,
			content: "<:mentira:" + emojiLocal + ">", want: "<:local:" + emojiLocal + ">",
		},
		{
			name: "cada um decide por si; o repetido publica uma vez", dest: noCanal, perms: permission.UseExternalEmojis,
			content:       "<:local:" + emojiLocal + "><:fora:" + emojiFora + "><:fora:" + emojiFora + "><:estranho:" + emojiEstran + ">",
			want:          "<:local:" + emojiLocal + "><:fora:" + emojiFora + "><:fora:" + emojiFora + ">:estranho:",
			wantPublished: []string{emojiFora},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			guard, store := testGuard(tc.perms)
			got, err := guard.SanitizeContent(context.Background(), tc.dest, "ana", tc.content)
			if err != nil {
				t.Fatalf("SanitizeContent: %v", err)
			}
			if got != tc.want {
				t.Errorf("conteúdo = %q, quer %q", got, tc.want)
			}
			if !slices.Equal(store.published, tc.wantPublished) {
				t.Errorf("publicados = %v, quer %v", store.published, tc.wantPublished)
			}
		})
	}
}

func TestSanitizeContentIdEmMaiusculasVaiParaOCanonico(t *testing.T) {
	guard, store := testGuard(0)
	const canonico = "aaaaaaaa-1111-4111-8111-111111111111"
	store.emojis[canonico] = EmojiRef{Name: "festa", ServerID: "aqui"}
	got, err := guard.SanitizeContent(context.Background(), noCanal, "ana", "<:festa:AAAAAAAA-1111-4111-8111-111111111111>")
	if err != nil || got != "<:festa:"+canonico+">" {
		t.Fatalf("got %q, %v", got, err)
	}
}

func TestSanitizeContentErroDoBancoNaoLibera(t *testing.T) {
	guard, store := testGuard(permission.UseExternalEmojis)
	store.failOn = errors.New("banco fora")
	if _, err := guard.SanitizeContent(context.Background(), noCanal, "ana", "<:fora:"+emojiFora+">"); err == nil {
		t.Fatal("devia devolver o erro em vez de deixar passar")
	}
}

// Canal sem servidor resolvido (a consulta falhou) não pode virar "DM": a
// permissão continua valendo porque quem manda é o canal.
func TestDestinoComCanalSempreConfereAPermissao(t *testing.T) {
	guard, _ := testGuard(0)
	got, err := guard.SanitizeContent(context.Background(), Destination{ChannelID: "canal"}, "ana", "<:fora:"+emojiFora+">")
	if err != nil || got != ":fora:" {
		t.Fatalf("got %q, %v", got, err)
	}
}

func TestCheckSticker(t *testing.T) {
	tests := []struct {
		name          string
		dest          Destination
		perms         int64
		sticker       string
		wantErr       error
		wantPublished []string
	}{
		{name: "do próprio servidor", dest: noCanal, sticker: "stk-local"},
		{name: "de fora sem a permissão", dest: noCanal, sticker: "stk-fora", wantErr: ErrForbidden},
		{name: "de fora com a permissão publica", dest: noCanal, perms: permission.UseExternalEmojis, sticker: "stk-fora", wantPublished: []string{"stk-fora"}},
		{name: "não membro", dest: noCanal, perms: permission.UseExternalEmojis, sticker: "stk-estranho", wantErr: ErrForbidden},
		{name: "DM membro publica", dest: naDM, sticker: "stk-fora", wantPublished: []string{"stk-fora"}},
		{name: "DM não membro", dest: naDM, sticker: "stk-estranho", wantErr: ErrForbidden},
		{name: "apagada", dest: naDM, sticker: "stk-sumiu", wantErr: ErrUnknownSticker},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			guard, store := testGuard(tc.perms)
			err := guard.CheckSticker(context.Background(), tc.dest, "ana", tc.sticker)
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("erro = %v, quer %v", err, tc.wantErr)
			}
			if !slices.Equal(store.published, tc.wantPublished) {
				t.Errorf("publicados = %v, quer %v", store.published, tc.wantPublished)
			}
		})
	}
}

func TestCheckReaction(t *testing.T) {
	tests := []struct {
		name          string
		dest          Destination
		perms         int64
		emoji         string
		wantErr       error
		wantPublished []string
	}{
		{name: "do próprio servidor", dest: noCanal, emoji: emojiLocal},
		{name: "de fora sem a permissão", dest: noCanal, emoji: emojiFora, wantErr: ErrForbidden},
		{name: "de fora com a permissão publica", dest: noCanal, perms: permission.UseExternalEmojis, emoji: emojiFora, wantPublished: []string{emojiFora}},
		{name: "não membro", dest: naDM, emoji: emojiEstran, wantErr: ErrForbidden},
		{name: "DM membro publica", dest: naDM, emoji: emojiFora, wantPublished: []string{emojiFora}},
		{name: "apagado", dest: naDM, emoji: emojiSumiu, wantErr: ErrUnknownEmoji},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			guard, store := testGuard(tc.perms)
			err := guard.CheckReaction(context.Background(), tc.dest, "ana", tc.emoji)
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("erro = %v, quer %v", err, tc.wantErr)
			}
			if !slices.Equal(store.published, tc.wantPublished) {
				t.Errorf("publicados = %v, quer %v", store.published, tc.wantPublished)
			}
		})
	}
}

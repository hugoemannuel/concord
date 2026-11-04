package message

import (
	"context"
	"errors"
	"testing"

	"gin-quickstart/backend/internal/expression"
)

const emojiExterno = "22222222-2222-4222-8222-222222222222"

// fakeExpressionGuard responde o combinado e guarda para onde cada coisa foi.
type fakeExpressionGuard struct {
	content     string
	contentErr  error
	stickerErr  error
	reactionErr error
	dests       []expression.Destination
	reactions   []string
}

func (f *fakeExpressionGuard) SanitizeContent(_ context.Context, dest expression.Destination, _, content string) (string, error) {
	f.dests = append(f.dests, dest)
	if f.contentErr != nil {
		return "", f.contentErr
	}
	if f.content != "" {
		return f.content, nil
	}
	return content, nil
}

func (f *fakeExpressionGuard) CheckSticker(_ context.Context, dest expression.Destination, _, _ string) error {
	f.dests = append(f.dests, dest)
	return f.stickerErr
}

func (f *fakeExpressionGuard) CheckReaction(_ context.Context, dest expression.Destination, _, emojiID string) error {
	f.dests = append(f.dests, dest)
	f.reactions = append(f.reactions, emojiID)
	return f.reactionErr
}

type fakeReactionLookup struct {
	present bool
	err     error
}

func (f fakeReactionLookup) HasReaction(context.Context, string, string) (bool, error) {
	return f.present, f.err
}

func TestGuardMessageTraduzErros(t *testing.T) {
	sticker := "stk"
	tests := []struct {
		name    string
		guard   *fakeExpressionGuard
		sticker *string
		wantErr error
	}{
		{name: "tudo certo", guard: &fakeExpressionGuard{}, sticker: &sticker},
		{name: "figurinha apagada", guard: &fakeExpressionGuard{stickerErr: expression.ErrUnknownSticker}, sticker: &sticker, wantErr: ErrInvalidSticker},
		{name: "figurinha sem permissão", guard: &fakeExpressionGuard{stickerErr: expression.ErrForbidden}, sticker: &sticker, wantErr: ErrExternalExpression},
		{name: "erro no texto", guard: &fakeExpressionGuard{contentErr: errors.New("banco fora")}, wantErr: errGuardFailed},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			use := &expressionUse{guard: tc.guard}
			_, err := use.message(context.Background(), expression.Destination{}, "ana", "oi", tc.sticker)
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("erro = %v, quer %v", err, tc.wantErr)
			}
		})
	}
}

func TestGuardMessageDevolveTextoLimpo(t *testing.T) {
	use := &expressionUse{guard: &fakeExpressionGuard{content: "oi :fora:"}}
	got, err := use.message(context.Background(), expression.Destination{}, "ana", "oi <:fora:x>", nil)
	if err != nil || got != "oi :fora:" {
		t.Fatalf("got %q, %v", got, err)
	}
}

func TestSemGuardNadaMuda(t *testing.T) {
	var use *expressionUse
	got, err := use.message(context.Background(), expression.Destination{}, "ana", "oi", nil)
	if err != nil || got != "oi" {
		t.Fatalf("got %q, %v", got, err)
	}
	if err := use.reaction(context.Background(), expression.Destination{}, "m1", "ana", "<:"+emojiExterno+">"); err != nil {
		t.Fatalf("reaction: %v", err)
	}
}

func TestGuardReaction(t *testing.T) {
	dm := expression.Destination{}
	custom := "<:" + emojiExterno + ">"
	tests := []struct {
		name        string
		emoji       string
		present     bool
		lookupErr   error
		reactionErr error
		wantErr     error
		wantChecks  int
	}{
		{name: "unicode não consulta nada", emoji: "👍"},
		{name: "personalizado novo passa pela regra", emoji: custom, wantChecks: 1},
		{name: "personalizado novo sem permissão", emoji: custom, reactionErr: expression.ErrForbidden, wantErr: ErrExternalExpression, wantChecks: 1},
		{name: "personalizado apagado", emoji: custom, reactionErr: expression.ErrUnknownEmoji, wantErr: ErrInvalidEmoji, wantChecks: 1},
		// Quem não é da origem pode somar-se à reação que já está na mensagem.
		{name: "somar-se a uma reação existente não pede nada", emoji: custom, present: true},
		{name: "erro ao consultar a reação recusa", emoji: custom, lookupErr: errors.New("banco fora"), wantErr: errGuardFailed},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			guard := &fakeExpressionGuard{reactionErr: tc.reactionErr}
			use := &expressionUse{guard: guard, reactions: fakeReactionLookup{present: tc.present, err: tc.lookupErr}}
			err := use.reaction(context.Background(), dm, "m1", "ana", tc.emoji)
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("erro = %v, quer %v", err, tc.wantErr)
			}
			if len(guard.reactions) != tc.wantChecks {
				t.Fatalf("regra chamada %d vezes, quer %d", len(guard.reactions), tc.wantChecks)
			}
			if tc.wantChecks == 1 && guard.reactions[0] != emojiExterno {
				t.Fatalf("emoji = %q", guard.reactions[0])
			}
		})
	}
}

func TestReactionErrorResponseSemPermissao(t *testing.T) {
	status, body := reactionErrorResponse(ErrExternalExpression, "falhou")
	if status != 403 || body["code"] != "external_expression" {
		t.Fatalf("status %d, corpo %v", status, body)
	}
}

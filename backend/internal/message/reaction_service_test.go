package message

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/bot"
	"gin-quickstart/backend/internal/expression"
	"gin-quickstart/backend/internal/permission"
)

func TestValidateNewMessageWithMedia(t *testing.T) {
	// Regular message with content
	if err := validateNewMessageWithMedia("Hello", nil, false); err != nil {
		t.Fatalf("expected valid message, got %v", err)
	}

	// Message without content but with media (e.g. sticker or gif)
	if err := validateNewMessageWithMedia("", nil, true); err != nil {
		t.Fatalf("expected valid message with media, got %v", err)
	}

	// Message without content and without media should fail
	if err := validateNewMessageWithMedia("", nil, false); err == nil {
		t.Fatalf("expected error for empty message without media")
	}

	// Message with whitespace only and without media should fail
	if err := validateNewMessageWithMedia("   ", nil, false); err == nil {
		t.Fatalf("expected error for whitespace message without media")
	}
}

func TestNormalizeMediaPointers(t *testing.T) {
	empty := "   "
	stk, gif, err := normalizeMediaPointers(&empty, &empty)
	if err != nil || stk != nil || gif != nil {
		t.Fatalf("expected nil pointers for whitespace strings, got stk=%v gif=%v err=%v", stk, gif, err)
	}

	badScheme := "javascript:alert(1)"
	if _, _, err := normalizeMediaPointers(nil, &badScheme); !errors.Is(err, ErrInvalidGifURL) {
		t.Fatalf("expected ErrInvalidGifURL for javascript scheme, got %v", err)
	}

	tooLong := "https://media.giphy.com/" + strings.Repeat("a", 1020)
	if _, _, err := normalizeMediaPointers(nil, &tooLong); !errors.Is(err, ErrInvalidGifURL) {
		t.Fatalf("expected ErrInvalidGifURL for >1024 url, got %v", err)
	}

	validID := " stk-123 "
	validGif := " https://media.giphy.com/media/abc/giphy.gif "
	stk, gif, err = normalizeMediaPointers(&validID, &validGif)
	if err != nil || stk == nil || *stk != "stk-123" || gif == nil || *gif != "https://media.giphy.com/media/abc/giphy.gif" {
		t.Fatalf("unexpected normalized values: stk=%v gif=%v err=%v", stk, gif, err)
	}
}

func TestStickerAndGifValidationInService(t *testing.T) {
	ctx := context.Background()
	svc := &Service{
		channelResolver: fakeRooms{}, // returns server "s1"
		expressions:     &expressionUse{guard: &fakeExpressionGuard{stickerErr: expression.ErrUnknownSticker}},
	}

	stkID := "stk-apagada"
	if _, err := svc.CreateChannelMessage(ctx, "geral", "ana", "", nil, nil, &stkID, nil, nil); !errors.Is(err, ErrInvalidSticker) {
		t.Fatalf("expected ErrInvalidSticker when sticker does not exist, got %v", err)
	}
	if _, err := svc.CreateConversationMessage(ctx, "dm1", "ana", "", nil, nil, &stkID, nil, nil); !errors.Is(err, ErrInvalidSticker) {
		t.Fatalf("expected ErrInvalidSticker in conversation, got %v", err)
	}

	// Empty content with empty gif_url string pointer is rejected as ErrContentRequired
	emptyStr := "  "
	if _, err := svc.CreateChannelMessage(ctx, "geral", "ana", "", nil, nil, nil, &emptyStr, nil); !errors.Is(err, ErrContentRequired) {
		t.Fatalf("expected ErrContentRequired when gif_url is whitespace and content is empty, got %v", err)
	}

	// Invalid gif_url scheme is rejected as ErrInvalidGifURL
	badURL := "ftp://bad.example/file.gif"
	if _, err := svc.CreateConversationMessage(ctx, "dm1", "ana", "olha", nil, nil, nil, &badURL, nil); !errors.Is(err, ErrInvalidGifURL) {
		t.Fatalf("expected ErrInvalidGifURL, got %v", err)
	}
}

type botConvResolver struct{}

func (botConvResolver) ConversationParticipantIDs(context.Context, string) ([]string, error) {
	return []string{"ana", bot.SalinhaBotID}, nil
}
func (botConvResolver) RevealConversation(context.Context, string) error { return nil }

func TestReactionHandlersValidationAndPermissions(t *testing.T) {
	ctx := context.Background()
	svc := &Service{
		convResolver: botConvResolver{},
	}

	// Invalid emoji rejected before DB
	if err := svc.AddChannelReaction(ctx, "geral", "m1", "ana", "not an emoji with spaces"); !errors.Is(err, ErrInvalidEmoji) {
		t.Fatalf("expected ErrInvalidEmoji, got %v", err)
	}
	if err := svc.RemoveChannelReaction(ctx, "geral", "m1", "ana", ""); !errors.Is(err, ErrInvalidEmoji) {
		t.Fatalf("expected ErrInvalidEmoji on empty remove, got %v", err)
	}

	// Bot conversation reaction rejected with ErrBotConversation
	if err := svc.AddConversationReaction(ctx, "dm-bot", "m1", "ana", "👍"); !errors.Is(err, ErrBotConversation) {
		t.Fatalf("expected ErrBotConversation, got %v", err)
	}

	// Missing ADD_REACTIONS permission on channel returns 403
	noReactPerms := allowAll{permission.ViewChannel | permission.SendMessages}
	router := editRouter(svc, "ana", noReactPerms, fakeAccess{})
	body, _ := json.Marshal(map[string]string{"emoji": "👍"})
	req := httptest.NewRequest(http.MethodPost, "/api/channels/geral/messages/m1/reactions", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 without AddReactions perm, got %d", rec.Code)
	}

	// Invalid emoji via handler returns 400
	withReactPerms := allowAll{permission.ViewChannel | permission.AddReactions}
	routerOk := editRouter(svc, "ana", withReactPerms, fakeAccess{})
	badBody, _ := json.Marshal(map[string]string{"emoji": ""})
	reqBad := httptest.NewRequest(http.MethodPost, "/api/channels/geral/messages/m1/reactions", bytes.NewReader(badBody))
	reqBad.Header.Set("Content-Type", "application/json")
	recBad := httptest.NewRecorder()
	routerOk.ServeHTTP(recBad, reqBad)
	if recBad.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid emoji, got %d", recBad.Code)
	}
}

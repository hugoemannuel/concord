package message

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

type systemChannelTestResolver struct {
	fakeRooms
	system map[string]bool
}

func (r systemChannelTestResolver) IsSystemChannel(_ context.Context, channelID string) (bool, error) {
	return r.system[channelID], nil
}

func TestDeleteChannelMessageBlockedInSystemChannels(t *testing.T) {
	resolver := systemChannelTestResolver{
		system: map[string]bool{
			"avisos": true,
			"bot":    true,
			"geral":  false,
		},
	}
	svc := &Service{channelResolver: resolver}
	ctx := context.Background()

	for _, ch := range []string{"avisos", "bot"} {
		err := svc.DeleteChannelMessage(ctx, ch, "m1", "ana")
		if !errors.Is(err, ErrSystemChannelDelete) {
			t.Fatalf("%s: DeleteChannelMessage err = %v, want ErrSystemChannelDelete", ch, err)
		}

		router := editRouter(svc, "ana", allowAll{}, fakeAccess{})
		req := httptest.NewRequest(http.MethodDelete, "/api/channels/"+ch+"/messages/m1", nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code != http.StatusForbidden {
			t.Fatalf("%s: status = %d, want 403", ch, rec.Code)
		}
	}
}

func TestValidateEmoji(t *testing.T) {
	valid := []string{"👍", "❤️", "😂", "🔥", "🎉", "👀", "👨‍💻"}
	for _, emoji := range valid {
		if err := ValidateEmoji(emoji); err != nil {
			t.Errorf("expected emoji %q to be valid, got error: %v", emoji, err)
		}
	}

	invalid := []string{
		"",
		"   ",
		" 👍",
		"👍 ",
		"👍 ❤️",
		"👍\n",
		strings.Repeat("a", 33),
	}
	for _, emoji := range invalid {
		if err := ValidateEmoji(emoji); err == nil {
			t.Errorf("expected emoji %q to be invalid", emoji)
		}
	}
}

func TestSameRoomTarget(t *testing.T) {
	chA := "channel-a"
	chB := "channel-b"
	convA := "conv-a"

	msgInChA := &Message{ID: "m1", ChannelID: &chA}
	msgInConvA := &Message{ID: "m2", ConversationID: &convA}

	if !SameRoomTarget(msgInChA, chA, "") {
		t.Fatal("expected message in channel-a to match channel-a")
	}
	if SameRoomTarget(msgInChA, chB, "") {
		t.Fatal("expected message in channel-a not to match channel-b")
	}
	if SameRoomTarget(msgInChA, "", convA) {
		t.Fatal("expected channel message not to match conversation")
	}
	if !SameRoomTarget(msgInConvA, "", convA) {
		t.Fatal("expected message in conv-a to match conv-a")
	}
	if SameRoomTarget(nil, chA, "") {
		t.Fatal("expected nil target not to match")
	}
}

func TestGroupReactionsPreservesOrderAndAggregatesUsers(t *testing.T) {
	rows := []ReactionRow{
		{MessageID: "m1", UserID: "u1", Emoji: "👍"},
		{MessageID: "m1", UserID: "u2", Emoji: "❤️"},
		{MessageID: "m1", UserID: "u3", Emoji: "👍"},
		{MessageID: "m2", UserID: "u1", Emoji: "🔥"},
	}

	grouped := GroupReactions(rows)

	wantM1 := []ReactionSummary{
		{Emoji: "👍", Count: 2, UserIDs: []string{"u1", "u3"}},
		{Emoji: "❤️", Count: 1, UserIDs: []string{"u2"}},
	}
	if !reflect.DeepEqual(grouped["m1"], wantM1) {
		t.Fatalf("m1 reactions = %+v, want %+v", grouped["m1"], wantM1)
	}

	wantM2 := []ReactionSummary{
		{Emoji: "🔥", Count: 1, UserIDs: []string{"u1"}},
	}
	if !reflect.DeepEqual(grouped["m2"], wantM2) {
		t.Fatalf("m2 reactions = %+v, want %+v", grouped["m2"], wantM2)
	}
}

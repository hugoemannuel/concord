package guest

import (
	"context"
	"reflect"
	"testing"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/audit/audittest"
)

func TestAuditConvitesDeVisitante(t *testing.T) {
	ctx := context.Background()
	w := newWorld()
	log := &audittest.Recorder{}
	w.svc.SetAudit(log)

	inv := w.invite()
	if _, err := w.svc.JoinWithAccount(ctx, inv.Token, "bia"); err != nil {
		t.Fatal(err)
	}
	w.calls.in["bia"] = "sala"
	if err := w.svc.EndGuest(ctx, "ana", "srv", "bia"); err == nil {
		t.Fatal("membro comum não expulsa")
	}
	if err := w.svc.EndGuest(ctx, "seg", "srv", "bia"); err != nil {
		t.Fatal(err)
	}
	if err := w.svc.RevokeInvite(ctx, "ana", inv.ID); err == nil {
		t.Fatal("membro comum não revoga")
	}
	if err := w.svc.RevokeInvite(ctx, "mod", inv.ID); err != nil {
		t.Fatal(err)
	}

	want := []audit.Event{
		{ServerID: "srv", ActorID: "mod", Action: audit.GuestInviteCreate, TargetType: audit.TargetInvite, TargetID: inv.ID, ChannelID: "sala",
			Changes: []audit.Change{{Field: "duration", After: "2h"}, {Field: "can_speak", After: true}, {Field: "can_stream", After: false}}},
		{ServerID: "srv", ActorID: "seg", Action: audit.GuestRemove, TargetType: audit.TargetMember, TargetID: "bia", ChannelID: "sala"},
		{ServerID: "srv", ActorID: "mod", Action: audit.GuestInviteDelete, TargetType: audit.TargetInvite, TargetID: inv.ID, ChannelID: "sala"},
	}
	if got := log.Events(); !reflect.DeepEqual(got, want) {
		t.Fatalf("eventos:\n got %+v\nwant %+v", got, want)
	}
}

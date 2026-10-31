package message

import (
	"errors"
	"reflect"
	"testing"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/audit/audittest"
	"gin-quickstart/backend/internal/permission"
)

// Num Postgres de verdade: apagar mensagem de outro, fixar e desafixar vão
// para o registro de auditoria; apagar a própria mensagem não.
func TestAuditMessageModerationDB(t *testing.T) {
	s := newSearchDB(t)
	perms := permission.PermissionService(permission.PermissionRepository(s.db))
	svc := MessageService(MessageRepository(s.db), &pinTestPublisher{}, &pinTestResolver{serverID: s.serverID}, nil, nil, perms)
	log := &audittest.Recorder{}
	svc.SetAudit(log)
	ana, bia := s.users["ana"], s.users["bia"]
	byMod := func(action audit.Action) audit.Event {
		return audit.Event{ServerID: s.serverID, ActorID: ana, Action: action, TargetType: audit.TargetMember, TargetID: bia, ChannelID: s.geral}
	}

	if _, err := svc.PinChannelMessage(s.ctx, s.geral, s.msgs["link"], ana); err != nil {
		t.Fatal(err)
	}
	pins, err := svc.ListChannelPins(s.ctx, s.geral, ana)
	if err != nil || len(pins) != 2 {
		t.Fatalf("fixadas = %d, %v", len(pins), err)
	}
	if err := svc.UnpinChannelMessage(s.ctx, s.geral, s.msgs["link"], ana); err != nil {
		t.Fatal(err)
	}
	if err := svc.DeleteChannelMessage(s.ctx, s.geral, s.msgs["link"], ana); err != nil {
		t.Fatal(err)
	}
	if err := svc.DeleteChannelMessage(s.ctx, s.geral, s.msgs["curinga"], bia); err != nil {
		t.Fatal(err)
	}
	want := []audit.Event{byMod(audit.MessagePin), byMod(audit.MessageUnpin), byMod(audit.MessageDelete)}
	if got := log.Events(); !reflect.DeepEqual(got, want) {
		t.Fatalf("eventos:\n got %+v\nwant %+v", got, want)
	}

	// Sem permissão ou mensagem de outro canal: nada é gravado.
	if _, err := svc.PinChannelMessage(s.ctx, s.geral, s.msgs["ola"], bia); !errors.Is(err, permission.ErrMissingPermission) {
		t.Fatalf("bia fixando: err = %v", err)
	}
	if err := svc.UnpinChannelMessage(s.ctx, s.geral, s.msgs["segredo"], ana); !errors.Is(err, ErrMessageNotFound) {
		t.Fatalf("desafixar de outro canal: err = %v", err)
	}
	if err := svc.DeleteChannelMessage(s.ctx, s.geral, s.msgs["ola"], bia); !errors.Is(err, ErrNotAuthor) {
		t.Fatalf("bia apagando da ana: err = %v", err)
	}
	if _, err := svc.ListChannelPins(s.ctx, s.segredo, s.users["caio"]); !errors.Is(err, ErrMessageNotFound) {
		t.Fatalf("fixadas de canal escondido: err = %v", err)
	}
	if got := len(log.Events()); got != 3 {
		t.Fatalf("eventos = %d, want 3", got)
	}
}

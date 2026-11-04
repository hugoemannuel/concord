package channelcategory

import (
	"testing"

	"gin-quickstart/backend/internal/permission"
)

func TestOverwritesAfterMove(t *testing.T) {
	everyone := "everyone"
	closed := permission.Overwrite{TargetType: permission.TargetRole, TargetID: everyone, Deny: permission.ViewChannel}
	vip := permission.Overwrite{TargetType: permission.TargetRole, TargetID: "vip", Allow: permission.ViewChannel | permission.Connect}
	equipe := permission.Overwrite{TargetType: permission.TargetRole, TargetID: "equipe", Allow: permission.ViewChannel | permission.Connect}
	mute := permission.Overwrite{TargetType: permission.TargetRole, TargetID: "vip", Deny: permission.SendMessages}
	privada, outraPrivada, aberta := "privada", "outra", "aberta"
	categories := map[string][]permission.Overwrite{
		privada:      {closed, vip},
		outraPrivada: {closed, equipe},
	}
	for _, tc := range []struct {
		name     string
		own      []permission.Overwrite
		from, to *string
		want     []permission.Overwrite
	}{
		{"público solto entra na privada e herda", nil, nil, &privada, []permission.Overwrite{closed, vip}},
		{"público solto entra na aberta e continua público", nil, nil, &aberta, nil},
		{"vinculado da aberta vai para a privada", nil, &aberta, &privada, []permission.Overwrite{closed, vip}},
		{"vinculado passa de uma privada para outra", []permission.Overwrite{closed, vip}, &privada, &outraPrivada, []permission.Overwrite{closed, equipe}},
		{"vinculado da privada não abre ao ir para a aberta", []permission.Overwrite{closed, vip}, &privada, &aberta, []permission.Overwrite{closed, vip}},
		{"vinculado da privada não abre ao ficar solto", []permission.Overwrite{closed, vip}, &privada, nil, []permission.Overwrite{closed, vip}},
		{"privado solto mantém a lista ao entrar na aberta", []permission.Overwrite{closed, vip}, nil, &aberta, []permission.Overwrite{closed, vip}},
		{"privado solto mantém a lista ao entrar na privada", []permission.Overwrite{closed, equipe}, nil, &privada, []permission.Overwrite{closed, equipe}},
		{"permissão própria na aberta continua própria", []permission.Overwrite{mute}, &aberta, &outraPrivada, []permission.Overwrite{mute}},
		{"permissão própria não abre ao sair da privada", []permission.Overwrite{mute}, &privada, nil, []permission.Overwrite{closed, {TargetType: permission.TargetRole, TargetID: "vip", Allow: vip.Allow, Deny: permission.SendMessages}}},
		{"sem regra na privada não abre ao sair", nil, &privada, &aberta, []permission.Overwrite{closed, vip}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := overwritesAfterMove(tc.own, channelMove{Channel: "c", From: tc.from, To: tc.to}, categories, everyone)
			if !permission.SameOverwrites(got, tc.want) {
				t.Fatalf("regras %+v, esperado %+v", got, tc.want)
			}
		})
	}
}

func TestMovesBetween(t *testing.T) {
	a, b := "a", "b"
	moves := movesBetween(
		[]Placement{{ChannelID: "fica", CategoryID: &a}, {ChannelID: "vai", CategoryID: &a, Fixed: true}, {ChannelID: "entra"}},
		[]Placement{{ChannelID: "fica", CategoryID: &a, Position: 9}, {ChannelID: "vai", CategoryID: &b}, {ChannelID: "entra", CategoryID: &a}, {ChannelID: "novo"}},
	)
	if len(moves) != 2 || moves[0].Channel != "vai" || !moves[0].Fixed || moves[1].Channel != "entra" {
		t.Fatalf("%+v", moves)
	}
}

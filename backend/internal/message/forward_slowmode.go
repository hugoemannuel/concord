package message

import (
	"context"
	"time"
)

// O encaminhamento para um canal com modo lento gasta a vez da pessoa, como
// qualquer mensagem (antes ele não passava pelo modo lento e virava atalho
// para mandar sem esperar). O comentário que vai junto sai na mesma vez.

// slowTurn: a vez que o encaminhamento marcou (at zero = nada marcado: DM,
// canal livre ou pessoa isenta).
type slowTurn struct {
	gate      *Slowmode
	channelID string
	userID    string
	at        time.Time
}

// takeTurn marca a vez no canal de destino; ainda sem vez, devolve o
// *SlowmodeError (429 no handler).
func (f *Forwarder) takeTurn(ctx context.Context, req ForwardRequest) (slowTurn, error) {
	if req.Target.ChannelID == "" {
		return slowTurn{}, nil
	}
	at, err := f.slowmode.Take(ctx, req.Target.ChannelID, req.UserID)
	return slowTurn{gate: f.slowmode, channelID: req.Target.ChannelID, userID: req.UserID, at: at}, err
}

// copyInTurn grava a cópia na vez do modo lento do destino; se a cópia
// falhar, a vez é devolvida.
func (f *Forwarder) copyInTurn(ctx context.Context, req ForwardRequest, src *Message) (*Message, slowTurn, error) {
	turn, err := f.takeTurn(ctx, req)
	if err != nil {
		return nil, turn, err
	}
	msg, err := f.copy(ctx, req, src)
	if err != nil {
		turn.release()
		return nil, turn, err
	}
	return msg, turn, nil
}

// release devolve a vez (o encaminhamento não saiu).
func (t slowTurn) release() {
	if !t.at.IsZero() {
		t.gate.Release(t.channelID, t.userID, t.at)
	}
}

// lendTo empresta a vez ao comentário: ela é devolvida para o envio dele
// marcar de novo e, se ele não sair, é marcada outra vez.
func (t slowTurn) lendTo(ctx context.Context, send func() (*Message, error)) (*Message, error) {
	if t.at.IsZero() {
		return send()
	}
	t.gate.Release(t.channelID, t.userID, t.at)
	msg, err := send()
	if err != nil {
		_, _ = t.gate.Take(ctx, t.channelID, t.userID)
	}
	return msg, err
}

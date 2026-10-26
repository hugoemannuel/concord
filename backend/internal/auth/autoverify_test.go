package auth

import (
	"context"
	"testing"
)

// Servidor sem SMTP (EMAIL_VERIFICATION=off): a conta nasce confirmada e nada é enviado.
func TestAutoVerifyConfirmsWithoutSendingMail(t *testing.T) {
	e := newEmailEnv()
	svc := e.h.emails.WithAutoVerify()

	svc.SendVerification(e.users.u)

	if !e.users.verified || e.users.u.EmailVerifiedAt == nil {
		t.Fatal("conta deveria ficar confirmada na hora")
	}
	if len(e.mail.sent) != 0 {
		t.Fatalf("nenhum e-mail deveria sair, saíram %d", len(e.mail.sent))
	}
}

func TestAutoVerifyResendConfirmsAndReportsNothingSent(t *testing.T) {
	e := newEmailEnv()
	svc := e.h.emails.WithAutoVerify()

	sent, err := svc.Resend(context.Background(), "u1")
	if err != nil {
		t.Fatal(err)
	}
	if sent || !e.users.verified || len(e.mail.sent) != 0 {
		t.Fatalf("sent=%v verified=%v mails=%d", sent, e.users.verified, len(e.mail.sent))
	}
}

func TestWithoutAutoVerifyStillMails(t *testing.T) {
	e := newEmailEnv()
	e.h.emails.SendVerification(e.users.u)
	if e.users.verified || len(e.mail.sent) != 1 {
		t.Fatalf("verified=%v mails=%d", e.users.verified, len(e.mail.sent))
	}
}

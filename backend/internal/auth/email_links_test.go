package auth

import (
	"context"
	"net/http"
	"testing"
)

// O link de confirmação não pode dar "inválido" para quem já confirmou (aberto
// duas vezes: duas abas, o app de e-mail e depois o navegador, um scanner de
// links) nem por causa de um reenvio pedido antes de o primeiro e-mail chegar.

func (e *emailEnv) verify(token string) int {
	return e.post("/v", e.h.VerifyEmail, `{"token":"`+token+`"}`, "").Code
}

func TestVerifyEmailSameLinkTwiceAnswersConfirmed(t *testing.T) {
	e := newEmailEnv()
	e.h.emails.SendVerification(e.users.u)
	token := e.tokenFromMail(t)

	if code := e.verify(token); code != http.StatusOK {
		t.Fatalf("primeira abertura: status %d", code)
	}
	if code := e.verify(token); code != http.StatusOK {
		t.Fatalf("segunda abertura do mesmo link: status %d, quer 200 (a conta já está confirmada)", code)
	}
}

func TestVerifyEmailUsedLinkOfUnconfirmedAccountIsInvalid(t *testing.T) {
	e := newEmailEnv()
	e.h.emails.SendVerification(e.users.u)
	token := e.tokenFromMail(t)
	if code := e.verify(token); code != http.StatusOK {
		t.Fatalf("primeira abertura: status %d", code)
	}
	// Trocou de e-mail depois: a conta voltou a "não confirmada".
	e.users.u.EmailVerifiedAt = nil
	if code := e.verify(token); code != http.StatusBadRequest {
		t.Fatalf("link usado de conta não confirmada: status %d, quer 400", code)
	}
}

func TestResendKeepsTheEarlierLinkValid(t *testing.T) {
	e := newEmailEnv()
	e.h.emails.SendVerification(e.users.u) // o do cadastro
	first := e.tokenFromMailAt(t, 0)
	if w := e.post("/s", e.h.ResendVerification, `{}`, "u1"); w.Code != http.StatusOK {
		t.Fatalf("reenvio: status %d", w.Code)
	}
	second := e.tokenFromMailAt(t, 1)

	if code := e.verify(first); code != http.StatusOK {
		t.Fatalf("link do primeiro e-mail depois do reenvio: status %d, quer 200", code)
	}
	if !e.users.verified {
		t.Fatal("o link do primeiro e-mail não confirmou a conta")
	}
	if code := e.verify(second); code != http.StatusOK {
		t.Fatalf("link do reenvio depois de confirmar: status %d, quer 200", code)
	}
}

func TestNewAddressInvalidatesTheOldAddressLinks(t *testing.T) {
	e := newEmailEnv()
	e.h.emails.SendVerification(e.users.u)
	old := e.tokenFromMailAt(t, 0)
	e.users.u.Email = "ana.nova@x.com"
	if err := e.h.emails.SendNewAddressVerification(context.Background(), e.users.u); err != nil {
		t.Fatal(err)
	}
	fresh := e.tokenFromMailAt(t, 1)
	if to := e.mail.sent[1].To; to != "ana.nova@x.com" {
		t.Fatalf("link do e-mail novo foi para %q", to)
	}

	if code := e.verify(old); code != http.StatusBadRequest {
		t.Fatalf("link do endereço antigo: status %d, quer 400", code)
	}
	if e.users.verified {
		t.Fatal("o link do endereço antigo confirmou o endereço novo")
	}
	if code := e.verify(fresh); code != http.StatusOK {
		t.Fatalf("link do endereço novo: status %d, quer 200", code)
	}
}

// O reset também confirma o e-mail: o link mandado ao endereço antigo não pode
// trocar a senha nem confirmar o endereço novo depois da troca.
func TestNewAddressInvalidatesTheResetLinkOfTheOldAddress(t *testing.T) {
	e := newEmailEnv()
	e.post("/f", e.h.ForgotPassword, `{"email":"ana@x.com"}`, "")
	reset := e.tokenFromMailAt(t, 0)
	e.users.u.Email = "ana.nova@x.com"
	if err := e.h.emails.SendNewAddressVerification(context.Background(), e.users.u); err != nil {
		t.Fatal(err)
	}

	body := `{"token":"` + reset + `","password":"senhanova123"}`
	if w := e.post("/r", e.h.ResetPassword, body, ""); w.Code != http.StatusBadRequest {
		t.Fatalf("reset do endereço antigo depois da troca: status %d, quer 400", w.Code)
	}
	if e.users.verified || e.users.password != "" {
		t.Fatalf("o link antigo mexeu na conta: confirmado=%v senha=%q", e.users.verified, e.users.password)
	}
}

func TestNewPasswordResetInvalidatesTheEarlierResetLink(t *testing.T) {
	e := newEmailEnv()
	e.post("/f", e.h.ForgotPassword, `{"email":"ana@x.com"}`, "")
	first := e.tokenFromMailAt(t, 0)
	e.post("/f", e.h.ForgotPassword, `{"email":"ana@x.com"}`, "")

	body := `{"token":"` + first + `","password":"senhanova123"}`
	if w := e.post("/r", e.h.ResetPassword, body, ""); w.Code != http.StatusBadRequest {
		t.Fatalf("link de reset anterior ao novo pedido: status %d, quer 400", w.Code)
	}
}

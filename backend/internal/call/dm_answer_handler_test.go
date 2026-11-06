package call

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func acceptRequest(s *Service, userID, callID string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	tokenRouter(s, userID).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/calls/"+callID+"/accept", nil))
	return rec
}

func TestAcceptRouteAnswersAfterJoining(t *testing.T) {
	s, pub := answerRig()

	rec := acceptRequest(s, "bia", "call-1")

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	// A resposta só sai com a entrada feita: o token pedido em seguida já vale.
	if !s.IsParticipant("call-1", "bia") {
		t.Fatal("bia ainda não é participante quando a rota respondeu")
	}
	if len(pub.eventsOf("call:accept")) != 1 {
		t.Fatal("esperava um call:accept para quem ligou")
	}
	s.mediaName = func(context.Context, string) string { return "Bia" }
	token := httptest.NewRecorder()
	tokenRouter(s, "bia").ServeHTTP(token, httptest.NewRequest(http.MethodPost, "/api/calls/call-1/token", nil))
	if token.Code != http.StatusOK {
		t.Fatalf("token logo depois do aceite = %d", token.Code)
	}
}

func TestAcceptRouteErrors(t *testing.T) {
	cases := []struct {
		name   string
		userID string
		callID string
		setup  func(*Service)
		want   int
	}{
		{name: "chamada que já acabou", userID: "bia", callID: "nao-existe", want: http.StatusNotFound},
		{name: "quem não foi chamado", userID: "intruso", callID: "call-1", want: http.StatusForbidden},
		{
			name: "ocupado em outra chamada", userID: "bia", callID: "call-1",
			setup: func(s *Service) { s.busy["bia"] = "outra" },
			want:  http.StatusConflict,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s, _ := answerRig()
			if tc.setup != nil {
				tc.setup(s)
			}
			if rec := acceptRequest(s, tc.userID, tc.callID); rec.Code != tc.want {
				t.Fatalf("status = %d, want %d (%s)", rec.Code, tc.want, rec.Body.String())
			}
		})
	}
}

package server

import (
	"net/http"
	"testing"
)

func TestInviteMember(t *testing.T) {
	casos := map[string]struct {
		actor, body string
		prepara     func(*Handler, *fakeServers)
		quer        respostaHTTP
	}{
		"amigo convidado": {"dono", `{"user_id":"bia"}`, nil, respostaHTTP{http.StatusCreated, `{"message":"invite sent"}`}},
		"json inválido":   {"dono", `{`, nil, respostaHTTP{http.StatusBadRequest, `{"error":"invalid request"}`}},
		"sem usuário":     {"", `{"user_id":"bia"}`, nil, respostaHTTP{http.StatusUnauthorized, `{"error":"unauthorized"}`}},
		"sem permissão":   {"ana", `{"user_id":"bia"}`, nil, respostaHTTP{http.StatusForbidden, `"code":"missing_permission"`}},
		"erro na permissão": {"dono", `{"user_id":"bia"}`, func(h *Handler, _ *fakeServers) { h.perms = denyPerms{err: errBanco} },
			respostaHTTP{http.StatusNotFound, `{"error":"server not found"}`}},
		"não é amigo": {"dono", `{"user_id":"bia"}`, func(_ *Handler, f *fakeServers) { f.friends = false },
			respostaHTTP{http.StatusBadRequest, `{"error":"you can only invite friends"}`}},
		"erro na amizade": {"dono", `{"user_id":"bia"}`, func(_ *Handler, f *fakeServers) { f.fail["AreFriends"] = errBanco },
			respostaHTTP{http.StatusBadRequest, `{"error":"you can only invite friends"}`}},
		"erro na checagem de membro": {"dono", `{"user_id":"bia"}`, func(_ *Handler, f *fakeServers) { f.fail["IsMember"] = errBanco },
			respostaHTTP{http.StatusInternalServerError, `{"error":"failed to check membership"}`}},
		"já é membro": {"dono", `{"user_id":"mod"}`, nil, respostaHTTP{http.StatusBadRequest, `{"error":"user is already a member"}`}},
		"convite pendente": {"dono", `{"user_id":"bia"}`, func(_ *Handler, f *fakeServers) { f.pending = &ServerInvite{} },
			respostaHTTP{http.StatusBadRequest, `{"error":"invite already sent"}`}},
		"banido": {"dono", `{"user_id":"bia"}`, func(_ *Handler, f *fakeServers) { f.fail["InviteUser"] = ErrBanned },
			respostaHTTP{http.StatusForbidden, `{"code":"banned","error":"esse usuário está banido do servidor"}`}},
		"falha ao convidar": {"dono", `{"user_id":"bia"}`, func(_ *Handler, f *fakeServers) { f.fail["InviteUser"] = errBanco },
			respostaHTTP{http.StatusInternalServerError, `{"error":"failed to invite user"}`}},
	}
	for nome, caso := range casos {
		t.Run(nome, func(t *testing.T) {
			h, f, _ := serverHandlerSetup()
			if caso.prepara != nil {
				caso.prepara(h, f)
			}
			confere(t, h, caso.actor, http.MethodPost, "/servers/s1/invite", caso.body, caso.quer)
		})
	}
}

func TestListasDeConvites(t *testing.T) {
	casos := map[string]struct {
		actor, path, fail string
		quer              respostaHTTP
	}{
		"meus convites":              {"ana", "/invites", "", respostaHTTP{http.StatusOK, `[]`}},
		"meus convites sem usuário":  {"", "/invites", "", respostaHTTP{http.StatusUnauthorized, `{"error":"unauthorized"}`}},
		"meus convites com falha":    {"ana", "/invites", "ListInvitesByInvitee", respostaHTTP{http.StatusInternalServerError, `{"error":"failed to list invites"}`}},
		"do servidor":                {"dono", "/servers/s1/invites", "", respostaHTTP{http.StatusOK, `[]`}},
		"do servidor sem usuário":    {"", "/servers/s1/invites", "", respostaHTTP{http.StatusUnauthorized, `{"error":"unauthorized"}`}},
		"do servidor sem ser membro": {"ana", "/servers/s1/invites", "", respostaHTTP{http.StatusForbidden, `{"error":"you are not a member of this server"}`}},
		"do servidor com falha":      {"dono", "/servers/s1/invites", "ListInvitesByServer", respostaHTTP{http.StatusInternalServerError, `{"error":"failed to list invites"}`}},
	}
	for nome, caso := range casos {
		t.Run(nome, func(t *testing.T) {
			h, f, _ := serverHandlerSetup()
			if caso.fail != "" {
				f.fail[caso.fail] = errBanco
			}
			confere(t, h, caso.actor, http.MethodGet, caso.path, "", caso.quer)
		})
	}
}

func TestAceitarERecusarConvite(t *testing.T) {
	casos := map[string]struct {
		actor, path string
		fail        map[string]error
		quer        respostaHTTP
	}{
		"aceita":             {"ana", "/invites/i1/accept", nil, respostaHTTP{http.StatusOK, `{"message":"joined server"}`}},
		"aceita sem usuário": {"", "/invites/i1/accept", nil, respostaHTTP{http.StatusUnauthorized, `{"error":"unauthorized"}`}},
		"aceita banido": {"ana", "/invites/i1/accept", map[string]error{"AcceptInvite": ErrBanned},
			respostaHTTP{http.StatusForbidden, `{"code":"banned","error":"` + ErrBanned.Error() + `"}`}},
		"aceita inválido": {"ana", "/invites/i1/accept", map[string]error{"AcceptInvite": errBanco},
			respostaHTTP{http.StatusBadRequest, `{"error":"banco fora"}`}},
		"recusa":             {"ana", "/invites/i1/decline", nil, respostaHTTP{http.StatusOK, `{"message":"invite declined"}`}},
		"recusa sem usuário": {"", "/invites/i1/decline", nil, respostaHTTP{http.StatusUnauthorized, `{"error":"unauthorized"}`}},
		"recusa com falha": {"ana", "/invites/i1/decline", map[string]error{"DeclineInvite": errBanco},
			respostaHTTP{http.StatusBadRequest, `{"error":"banco fora"}`}},
	}
	for nome, caso := range casos {
		t.Run(nome, func(t *testing.T) {
			h, f, _ := serverHandlerSetup()
			for k, v := range caso.fail {
				f.fail[k] = v
			}
			confere(t, h, caso.actor, http.MethodPost, caso.path, "", caso.quer)
		})
	}
}

func TestInviteCodeHandler(t *testing.T) {
	casos := map[string]struct {
		actor   string
		prepara func(*Handler, *fakeServers)
		quer    respostaHTTP
	}{
		"membro com permissão": {"dono", nil, respostaHTTP{http.StatusOK, `{"code":"ABCD2345"}`}},
		"sem usuário":          {"", nil, respostaHTTP{http.StatusUnauthorized, `{"error":"unauthorized"}`}},
		"sem permissão":        {"ana", nil, respostaHTTP{http.StatusForbidden, `"code":"missing_permission"`}},
		"erro na permissão": {"dono", func(h *Handler, _ *fakeServers) { h.perms = denyPerms{err: errBanco} },
			respostaHTTP{http.StatusInternalServerError, `{"error":"failed to get invite code"}`}},
		"não membro": {"dono", func(_ *Handler, f *fakeServers) { f.fail["InviteCode"] = ErrNotServerMember },
			respostaHTTP{http.StatusForbidden, `{"error":"you are not a member of this server"}`}},
		"falha": {"dono", func(_ *Handler, f *fakeServers) { f.fail["InviteCode"] = errBanco },
			respostaHTTP{http.StatusInternalServerError, `{"error":"failed to get invite code"}`}},
	}
	for nome, caso := range casos {
		t.Run(nome, func(t *testing.T) {
			h, f, _ := serverHandlerSetup()
			if caso.prepara != nil {
				caso.prepara(h, f)
			}
			confere(t, h, caso.actor, http.MethodGet, "/servers/s1/invite-code", "", caso.quer)
		})
	}
}

func TestJoinByCodeHandler(t *testing.T) {
	casos := map[string]struct {
		actor, body string
		fail        error
		quer        respostaHTTP
	}{
		"entra":           {"ana", `{"code":"ABCD2345"}`, nil, respostaHTTP{http.StatusOK, `"id":"s1"`}},
		"json inválido":   {"ana", `{`, nil, respostaHTTP{http.StatusBadRequest, `{"error":"invalid request"}`}},
		"sem usuário":     {"", `{"code":"x"}`, nil, respostaHTTP{http.StatusUnauthorized, `{"error":"unauthorized"}`}},
		"banido":          {"ana", `{"code":"x"}`, ErrBanned, respostaHTTP{http.StatusForbidden, `{"code":"banned","error":"` + ErrBanned.Error() + `"}`}},
		"código inválido": {"ana", `{"code":"x"}`, ErrInvalidCode, respostaHTTP{http.StatusNotFound, `{"error":"` + ErrInvalidCode.Error() + `"}`}},
		"falha":           {"ana", `{"code":"x"}`, errBanco, respostaHTTP{http.StatusInternalServerError, `{"error":"failed to join server"}`}},
	}
	for nome, caso := range casos {
		t.Run(nome, func(t *testing.T) {
			h, f, _ := serverHandlerSetup()
			f.fail["JoinByCode"] = caso.fail
			confere(t, h, caso.actor, http.MethodPost, "/invites/join", caso.body, caso.quer)
		})
	}
}

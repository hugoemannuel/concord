package server

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/channel"
	"gin-quickstart/backend/internal/permission"
)

var errBanco = errors.New("banco fora")

// fakeServers: servidores, membros e convites em memória. fail[método] faz o
// método falhar.
type fakeServers struct {
	servers  map[string]*Server
	members  map[string]bool // "servidor/usuário"
	friends  bool
	pending  *ServerInvite
	fail     map[string]error
	joined   []string
	deleted  []string
	invited  []string
	accepted []string
}

func newFakeServers() *fakeServers {
	return &fakeServers{
		servers: map[string]*Server{"s1": {ID: "s1", Name: "Turma", OwnerID: "dono"}},
		members: map[string]bool{"s1/dono": true, "s1/mod": true},
		friends: true,
		fail:    map[string]error{},
	}
}

func (f *fakeServers) Create(_ context.Context, s *Server) error {
	if s.Name == "" {
		return errors.New("name is required")
	}
	s.ID = "novo"
	f.servers[s.ID] = s
	return f.fail["Create"]
}

func (f *fakeServers) NotifyMemberJoined(_ context.Context, serverID, userID string) {
	f.joined = append(f.joined, serverID+"/"+userID)
}

func (f *fakeServers) FindByID(_ context.Context, id string) (*Server, error) {
	if s, ok := f.servers[id]; ok {
		return s, nil
	}
	return nil, errors.New("not found")
}

func (f *fakeServers) Delete(_ context.Context, id string) error {
	f.deleted = append(f.deleted, id)
	return f.fail["Delete"]
}

func (f *fakeServers) ListByUserID(context.Context, string) ([]Server, error) {
	return []Server{}, f.fail["ListByUserID"]
}

func (f *fakeServers) IsMember(_ context.Context, serverID, userID string) (bool, error) {
	return f.members[serverID+"/"+userID], f.fail["IsMember"]
}

func (f *fakeServers) ListMembers(context.Context, string) ([]ServerMember, error) {
	return []ServerMember{{UserID: "dono"}}, f.fail["ListMembers"]
}

func (f *fakeServers) List(context.Context, string, string) ([]permission.Role, error) {
	return []permission.Role{}, f.fail["Roles"]
}

func (f *fakeServers) AreFriends(context.Context, string, string) (bool, error) {
	return f.friends, f.fail["AreFriends"]
}

func (f *fakeServers) FindPendingInvite(context.Context, string, string) (*ServerInvite, error) {
	return f.pending, nil
}

func (f *fakeServers) InviteUser(_ context.Context, _, _, inviteeID string) error {
	f.invited = append(f.invited, inviteeID)
	return f.fail["InviteUser"]
}

func (f *fakeServers) ListInvitesByInvitee(context.Context, string) ([]ServerInvite, error) {
	return []ServerInvite{}, f.fail["ListInvitesByInvitee"]
}

func (f *fakeServers) ListInvitesByServer(context.Context, string) ([]ServerInvite, error) {
	return []ServerInvite{}, f.fail["ListInvitesByServer"]
}

func (f *fakeServers) AcceptInvite(_ context.Context, inviteID, _ string) error {
	f.accepted = append(f.accepted, inviteID)
	return f.fail["AcceptInvite"]
}

func (f *fakeServers) DeclineInvite(context.Context, string, string) error {
	return f.fail["DeclineInvite"]
}

func (f *fakeServers) InviteCode(context.Context, string, string) (string, error) {
	return "ABCD2345", f.fail["InviteCode"]
}

func (f *fakeServers) JoinByCode(context.Context, string, string) (*Server, error) {
	if err := f.fail["JoinByCode"]; err != nil {
		return nil, err
	}
	return f.servers["s1"], nil
}

// fakeChannels: canais padrão; failAt diz qual criação falha.
type fakeChannels struct {
	failAt  string
	created []string
}

func (f *fakeChannels) step(name string) error {
	if f.failAt == name {
		return errBanco
	}
	f.created = append(f.created, name)
	return nil
}

func (f *fakeChannels) Create(_ context.Context, ch *channel.Channel, _ ...permission.Overwrite) error {
	return f.step(ch.Name)
}

func (f *fakeChannels) CreateNotices(context.Context, string, string) (*channel.Channel, error) {
	return nil, f.step("avisos")
}

func (f *fakeChannels) CreateSystem(context.Context, string, string) (*channel.Channel, error) {
	return nil, f.step("bot")
}

func serverHandlerSetup() (*Handler, *fakeServers, *fakeChannels) {
	f, ch := newFakeServers(), &fakeChannels{}
	return &Handler{service: f, invites: f, friends: f, roles: f, channels: ch, perms: allowPerms{}}, f, ch
}

type respostaHTTP struct {
	status int
	body   string
}

func confere(t *testing.T, h *Handler, actor, method, path, body string, quer respostaHTTP) {
	t.Helper()
	w := settingsRequest(t, h, actor, method, path, body)
	if w.Code != quer.status || !strings.Contains(w.Body.String(), quer.body) {
		t.Fatalf("%s %s = %d %s; quer %d com %s", method, path, w.Code, w.Body.String(), quer.status, quer.body)
	}
}

func TestCreateServidorCriaCanaisPadrao(t *testing.T) {
	h, f, ch := serverHandlerSetup()
	confere(t, h, "dono", http.MethodPost, "/servers", `{"name":"Nova"}`, respostaHTTP{http.StatusCreated, `"id":"novo"`})
	if got := strings.Join(ch.created, ","); got != "geral,avisos,bot" {
		t.Fatalf("canais = %s", got)
	}
	if len(f.joined) != 1 || f.joined[0] != "novo/dono" {
		t.Fatalf("entrada avisada = %v", f.joined)
	}
}

func TestCreateServidorRecusas(t *testing.T) {
	casos := map[string]struct {
		actor, body, failAt string
		quer                respostaHTTP
	}{
		"json inválido":    {"dono", `{`, "", respostaHTTP{http.StatusBadRequest, `{"error":"invalid request"}`}},
		"sem usuário":      {"", `{"name":"x"}`, "", respostaHTTP{http.StatusUnauthorized, `{"error":"unauthorized"}`}},
		"sem nome":         {"dono", `{}`, "", respostaHTTP{http.StatusBadRequest, `{"error":"name is required"}`}},
		"falha no geral":   {"dono", `{"name":"x"}`, "geral", respostaHTTP{http.StatusInternalServerError, `{"error":"failed to create default channel"}`}},
		"falha nos avisos": {"dono", `{"name":"x"}`, "avisos", respostaHTTP{http.StatusInternalServerError, `{"error":"failed to create notices channel"}`}},
		"falha no bot":     {"dono", `{"name":"x"}`, "bot", respostaHTTP{http.StatusInternalServerError, `{"error":"failed to create bot channel"}`}},
	}
	for nome, caso := range casos {
		t.Run(nome, func(t *testing.T) {
			h, _, ch := serverHandlerSetup()
			ch.failAt = caso.failAt
			confere(t, h, caso.actor, http.MethodPost, "/servers", caso.body, caso.quer)
		})
	}
}

func TestDeleteServidorSoODono(t *testing.T) {
	casos := map[string]struct {
		actor, path string
		fail        error
		quer        respostaHTTP
	}{
		"dono apaga":      {"dono", "/servers/s1", nil, respostaHTTP{http.StatusOK, `{"message":"server deleted"}`}},
		"sem usuário":     {"", "/servers/s1", nil, respostaHTTP{http.StatusUnauthorized, `{"error":"unauthorized"}`}},
		"não existe":      {"dono", "/servers/x", nil, respostaHTTP{http.StatusNotFound, `{"error":"server not found"}`}},
		"não é o dono":    {"mod", "/servers/s1", nil, respostaHTTP{http.StatusForbidden, `{"error":"only the owner can delete the server"}`}},
		"falha ao apagar": {"dono", "/servers/s1", errBanco, respostaHTTP{http.StatusInternalServerError, `{"error":"failed to delete server"}`}},
	}
	for nome, caso := range casos {
		t.Run(nome, func(t *testing.T) {
			h, f, _ := serverHandlerSetup()
			f.fail["Delete"] = caso.fail
			confere(t, h, caso.actor, http.MethodDelete, caso.path, "", caso.quer)
		})
	}
}

func TestGetByIDSoParaMembro(t *testing.T) {
	casos := map[string]struct {
		actor, path, fail string
		quer              respostaHTTP
	}{
		"membro vê":         {"dono", "/servers/s1", "", respostaHTTP{http.StatusOK, `"members":[`}},
		"sem usuário":       {"", "/servers/s1", "", respostaHTTP{http.StatusUnauthorized, `{"error":"unauthorized"}`}},
		"não membro":        {"ana", "/servers/s1", "", respostaHTTP{http.StatusForbidden, `{"error":"you are not a member of this server"}`}},
		"erro na checagem":  {"dono", "/servers/s1", "IsMember", respostaHTTP{http.StatusForbidden, `{"error":"you are not a member of this server"}`}},
		"falha nos membros": {"dono", "/servers/s1", "ListMembers", respostaHTTP{http.StatusInternalServerError, `{"error":"failed to list members"}`}},
		"falha nos cargos":  {"dono", "/servers/s1", "Roles", respostaHTTP{http.StatusInternalServerError, `{"error":"failed to list roles"}`}},
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

func TestGetByIDServidorSumiu(t *testing.T) {
	h, f, _ := serverHandlerSetup()
	delete(f.servers, "s1")
	confere(t, h, "dono", http.MethodGet, "/servers/s1", "", respostaHTTP{http.StatusNotFound, `{"error":"server not found"}`})
}

func TestListByUser(t *testing.T) {
	h, f, _ := serverHandlerSetup()
	confere(t, h, "dono", http.MethodGet, "/servers", "", respostaHTTP{http.StatusOK, `[]`})
	f.fail["ListByUserID"] = errBanco
	confere(t, h, "dono", http.MethodGet, "/servers", "", respostaHTTP{http.StatusInternalServerError, `{"error":"failed to list servers"}`})
}

package websocket

import (
	"context"
	"encoding/json"
	"log"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"gin-quickstart/backend/internal/platform/wsevent"
	"gin-quickstart/backend/internal/user"
)

// Atividade ("rich presence"): o que a pessoa está jogando (e ouvindo, em
// listening.go) agora. Fica só na memória do hub, como a presença: some
// quando a última conexão cai.

const (
	ActivityKindGame = "game"

	maxActivityNameRunes = 64
	// Limite do appid da Steam (inteiro de 32 bits); acima disso é lixo.
	maxSteamAppID = 1<<31 - 1
	// Um jogo novo a cada tantos segundos, no máximo, por usuário.
	activityMinInterval = time.Second
)

// steamIconHashRE: sha1 em hexadecimal do ícone do jogo no CDN da Steam.
var steamIconHashRE = regexp.MustCompile(`^[0-9a-f]{40}$`)

type Activity struct {
	Name string `json:"name"`
	Kind string `json:"kind"`
	// Unix em milissegundos de quando começou.
	StartedAt int64 `json:"started_at"`
	// AppID do jogo na Steam (ícone no cliente); 0 = jogo fora da Steam.
	AppID int64 `json:"app_id,omitempty"`
	// IconHash é o sha1 do ícone na Steam; só vale junto com AppID.
	IconHash string `json:"icon_hash,omitempty"`
}

// richPresence é o que cada usuário está fazendo agora, por tipo. Protegido
// por Hub.mu.
type richPresence struct {
	games     activitySlot[Activity]
	listening activitySlot[Listening]
}

func newRichPresence() richPresence {
	return richPresence{games: newActivitySlot(sameGame), listening: newActivitySlot(sameListening)}
}

// ActivityEntry é o que alguém está fazendo agora. O jogo vai nos campos de
// cima (o formato de antes, que apps antigos leem) e a música em "listening".
type ActivityEntry struct {
	*Activity
	Listening *Listening `json:"listening,omitempty"`
}

func (e ActivityEntry) empty() bool {
	return e.Activity == nil && e.Listening == nil
}

// of devolve uma cópia do que userID está fazendo.
func (r *richPresence) of(userID string) ActivityEntry {
	return ActivityEntry{Activity: r.games.get(userID), Listening: r.listening.get(userID)}
}

// sameGame: o mesmo jogo de novo (o início não conta) não avisa ninguém.
func sameGame(prev, next Activity) bool {
	return prev.Name == next.Name && prev.Kind == next.Kind && prev.AppID == next.AppID && prev.IconHash == next.IconHash
}

// drop esquece as atividades de quem saiu; devolve se havia alguma.
func (r *richPresence) drop(userID string) bool {
	hadGame := r.games.drop(userID)
	hadListening := r.listening.drop(userID)
	return hadGame || hadListening
}

// HandleActivity trata "activity:set" e "activity:clear" vindos do app. O
// "kind" diz o tipo; sem ele (apps antigos), é o jogo.
func (h *Hub) HandleActivity(userID, evType string, payload json.RawMessage) {
	listening := activityKind(payload) == ActivityKindListening
	if evType == "activity:clear" {
		h.clearActivity(userID, listening)
		return
	}
	if listening {
		if l, ok := parseListening(payload, time.Now()); ok {
			h.SetListening(userID, l)
		}
		return
	}
	if a, ok := parseGameActivity(payload, time.Now()); ok {
		h.SetActivity(userID, a)
	}
}

func activityKind(payload json.RawMessage) string {
	var p struct {
		Kind string `json:"kind"`
	}
	_ = json.Unmarshal(payload, &p)
	return p.Kind
}

func (h *Hub) clearActivity(userID string, listening bool) {
	if listening {
		h.SetListening(userID, nil)
		return
	}
	h.SetActivity(userID, nil)
}

// parseGameActivity valida o jogo que o app mandou; ok = false descarta.
func parseGameActivity(payload json.RawMessage, now time.Time) (*Activity, bool) {
	var p struct {
		Name      string `json:"name"`
		Kind      string `json:"kind"`
		StartedAt int64  `json:"started_at"`
		AppID     int64  `json:"app_id"`
		IconHash  string `json:"icon_hash"`
	}
	if err := json.Unmarshal(payload, &p); err != nil {
		return nil, false
	}
	name := strings.TrimSpace(p.Name)
	if p.Kind != ActivityKindGame || !runesWithin(name, 1, maxActivityNameRunes) {
		return nil, false
	}
	appID, iconHash := steamIcon(p.AppID, p.IconHash)
	return &Activity{Name: name, Kind: p.Kind, StartedAt: clampStart(p.StartedAt, now), AppID: appID, IconHash: iconHash}, true
}

// runesWithin: o texto tem entre min e max caracteres.
func runesWithin(s string, min, max int) bool {
	n := utf8.RuneCountInString(s)
	return n >= min && n <= max
}

// clampStart: relógio do cliente não manda; início no futuro ou ausente vira agora.
func clampStart(started int64, now time.Time) int64 {
	ms := now.UnixMilli()
	if started <= 0 || started > ms {
		return ms
	}
	return started
}

// steamIcon: o ícone só vale com appid e hash válidos; senão o cliente usa o genérico.
func steamIcon(appID int64, hash string) (int64, string) {
	if appID <= 0 || appID > maxSteamAppID || !steamIconHashRE.MatchString(hash) {
		return 0, ""
	}
	return appID, hash
}

// SetActivity guarda (ou limpa, com nil) o jogo e avisa o público. Sem
// conexão aberta, não guarda nada.
func (h *Hub) SetActivity(userID string, a *Activity) {
	h.changeActivity(userID, func(r *richPresence, now time.Time) bool {
		if a == nil {
			return r.games.clear(userID)
		}
		return r.games.set(userID, *a, now)
	})
}

// changeActivity aplica change sob o lock (só para quem está conectado) e, se
// mudou algo, avisa o público. Invisível não avisa ninguém: já parece sem nada.
func (h *Hub) changeActivity(userID string, change func(*richPresence, time.Time) bool) {
	h.mu.Lock()
	if h.presence[userID] <= 0 || !change(&h.rich, time.Now()) {
		h.mu.Unlock()
		return
	}
	entry := h.rich.of(userID)
	hidden := h.statuses[userID] == user.StatusInvisible
	h.mu.Unlock()

	if !hidden {
		h.publishActivity(userID, entry)
	}
}

// republishOnVisibility: invisível esconde a atividade; ao voltar, ela reaparece.
func (h *Hub) republishOnVisibility(userID string, wasInvisible, nowInvisible bool) {
	if wasInvisible == nowInvisible || !h.IsOnline(userID) {
		return
	}
	h.mu.RLock()
	entry := h.rich.of(userID)
	h.mu.RUnlock()
	if entry.empty() {
		return
	}
	if nowInvisible {
		entry = ActivityEntry{}
	}
	h.publishActivity(userID, entry)
}

// publishActivity manda presence:activity (jogo e música, null = nada) para o
// público e para as conexões do próprio usuário. A consulta do público roda
// fora do lock.
func (h *Hub) publishActivity(userID string, entry ActivityEntry) {
	h.mu.RLock()
	provider := h.audience
	h.mu.RUnlock()

	event := wsevent.Marshal("presence:activity", map[string]interface{}{
		"user_id":   userID,
		"activity":  entry.Activity,
		"listening": entry.Listening,
	})
	h.SendToUser(userID, event)
	if provider == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	ids, err := provider.Audience(ctx, userID)
	if err != nil {
		log.Printf("[ws] activity audience of %s: %v", userID, err)
		return
	}
	for _, id := range ids {
		h.SendToUser(id, event)
	}
}

// ActivitiesFor devolve a atividade de cada id que viewerID pode ver (ele
// mesmo, amigos e quem divide servidor), sem quem está offline ou invisível.
func (h *Hub) ActivitiesFor(ctx context.Context, viewerID string, ids []string) map[string]ActivityEntry {
	h.mu.RLock()
	provider := h.audience
	h.mu.RUnlock()

	result := make(map[string]ActivityEntry)
	if provider == nil {
		return result
	}
	audience, err := provider.Audience(ctx, viewerID)
	if err != nil {
		log.Printf("[ws] activities audience of %s: %v", viewerID, err)
		return result
	}
	allowed := make(map[string]struct{}, len(audience)+1)
	allowed[viewerID] = struct{}{}
	for _, id := range audience {
		allowed[id] = struct{}{}
	}

	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, id := range ids {
		if _, ok := allowed[id]; !ok {
			continue
		}
		entry := h.rich.of(id)
		if entry.empty() || h.effectiveStatusLocked(id) == user.StatusOffline {
			continue
		}
		result[id] = entry
	}
	return result
}

// Package apperrors: o relatório de erros do app (docs/adr/0068). O desktop,
// o web e o Android mandam os erros já limpos (POST /obs/errors); os panics do
// backend chegam pelo internal/platform/recovery. Tudo vira um grupo por
// impressão digital e uma ocorrência por (grupo, pessoa, hora, versão). Os
// devs leem o painel (GET /obs/errors); o obs-alertas lê alerts.go.
package apperrors

import "time"

// Origens do erro. O backend só nasce no servidor (o cliente não pode mandar).
const (
	SourceRenderer = "renderer"
	SourceMain     = "main"
	SourceMobile   = "mobile"
	SourceBackend  = "backend"
)

// Alvos (onde o app roda). O servidor é o alvo dos panics do backend.
const (
	TargetDesktop = "desktop"
	TargetWeb     = "web"
	TargetAndroid = "android"
	TargetServer  = "servidor"
)

// Batch: um pedido do app (POST /api/obs/errors).
type Batch struct {
	Context ClientContext `json:"context"`
	Errors  []Captured    `json:"errors"`
}

// ClientContext: de onde o pedido veio (vale para todos os erros dele).
type ClientContext struct {
	OS         string `json:"os"`
	AppVersion string `json:"app_version"`
	Target     string `json:"target"`
}

// Captured: um erro (já agrupado no aparelho, com a contagem de repetições).
// Fingerprint é calculada no servidor (prepare); o que vier do cliente é ignorado.
type Captured struct {
	Source      string `json:"source"`
	Kind        string `json:"kind"`
	Message     string `json:"message"`
	Stack       string `json:"stack"`
	Screen      string `json:"screen"`
	InCall      bool   `json:"in_call"`
	InLive      bool   `json:"in_live"`
	Count       int    `json:"count"`
	Fingerprint string `json:"-"`
}

// GroupSummary: um item de groups no GET /obs/errors (e o group do detalhe).
// count e users contam só a janela pedida.
type GroupSummary struct {
	Fingerprint  string    `json:"fingerprint"`
	Source       string    `json:"source"`
	Kind         string    `json:"kind"`
	Message      string    `json:"message"`
	FirstSeen    time.Time `json:"first_seen"`
	LastSeen     time.Time `json:"last_seen"`
	Count        int       `json:"count"`
	Users        int       `json:"users"`
	Versions     []string  `json:"versions"`
	Systems      []string  `json:"systems"`
	Targets      []string  `json:"targets"`
	NewInVersion bool      `json:"new_in_version"`
}

// ErrorsReport: o GET /obs/errors.
type ErrorsReport struct {
	From     time.Time      `json:"from"`
	To       time.Time      `json:"to"`
	Versions []string       `json:"versions"`
	Groups   []GroupSummary `json:"groups"`
}

// ScreenCount: quantas vezes o erro aconteceu numa tela.
type ScreenCount struct {
	Screen string `json:"screen"`
	Count  int    `json:"count"`
}

// Occurrence: uma linha de ocorrência (pessoa, hora, versão), da mais nova.
type Occurrence struct {
	At         time.Time `json:"at"`
	Username   string    `json:"username"`
	AppVersion string    `json:"app_version"`
	OS         string    `json:"os"`
	Target     string    `json:"target"`
	Screen     string    `json:"screen"`
	InCall     bool      `json:"in_call"`
	InLive     bool      `json:"in_live"`
	Count      int       `json:"count"`
}

// GroupDetail: o GET /obs/errors/:fingerprint.
type GroupDetail struct {
	Group      GroupSummary  `json:"group"`
	Stack      string        `json:"stack"`
	Translated string        `json:"translated"`
	Screens    []ScreenCount `json:"screens"`
	Recent     []Occurrence  `json:"recent"`
}

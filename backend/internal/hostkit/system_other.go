//go:build !linux

package hostkit

import (
	"errors"
	"time"
)

// O servidor só roda numa VPS Linux. Nos outros sistemas o salinha-host serve
// para o deploy (deploy.go) e para testes do supervisor.

var errLinuxOnly = errors.New("o servidor da Salinha roda numa VPS Linux")

func PrepareSystem(Layout) (string, error) { return "", errLinuxOnly }

func FinishSystem(Layout) (string, error) { return "", errLinuxOnly }

func startService(Layout) (bool, error) { return false, nil }

func FixOwnership(Layout) error { return nil }

func StopSystem(l Layout) error { return ControlStop(l, 90*time.Second) }

package main

import (
	"testing"
	"testing/synctest"
)

// O desligamento só segue quando os alertas gravaram a parada limpa E os
// badges de antes terminaram.
func TestRunUntilShutdownEsperaOsDois(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		before := make(chan struct{})
		ran := false
		done := runUntilShutdown(before, func() { ran = true })
		synctest.Wait()
		select {
		case <-done:
			t.Fatal("fechou antes dos badges")
		default:
		}
		close(before)
		<-done
		if !ran {
			t.Fatal("não rodou")
		}
		<-runUntilShutdown(nil, func() {})
	})
}

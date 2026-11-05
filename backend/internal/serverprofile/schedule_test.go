package serverprofile

import (
	"context"
	"testing"
	"testing/synctest"
	"time"
)

func TestRunEvery(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		runs := 0
		done := make(chan struct{})
		go func() {
			runEvery(ctx, time.Minute, true, func() { runs++ })
			close(done)
		}()
		synctest.Wait()
		if runs != 1 {
			t.Fatalf("na largada = %d, quer 1", runs)
		}
		time.Sleep(2*time.Minute + time.Second)
		synctest.Wait()
		if runs != 3 {
			t.Fatalf("depois de 2 min = %d, quer 3", runs)
		}
		cancel()
		<-done
	})
}

func TestSamplerEFaxinaRodamAteCancelar(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		store := &fakeSamples{}
		sampler := NewGameSampler(func() []PlayedGame {
			return []PlayedGame{{UserID: "ana", Game: Game{Name: "Dota 2"}}}
		}, store)
		files := &fakeFiles{}
		done := make(chan struct{}, 2)
		go func() {
			sampler.Run(ctx)
			done <- struct{}{}
		}()
		go func() {
			NewImageJanitor(files, fakeRefs{}).Run(ctx)
			done <- struct{}{}
		}()
		time.Sleep(gameSampleEvery + time.Second)
		synctest.Wait()
		if len(store.plays) != 1 {
			t.Errorf("amostras = %d, quer 1", len(store.plays))
		}
		cancel()
		<-done
		<-done
	})
}

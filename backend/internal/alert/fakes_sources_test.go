package alert

import (
	"context"
	"time"

	"gin-quickstart/backend/internal/serverobs"
)

// As fontes da parte 2 no fakeSources (rules_test.go): linhas da mais antiga à mais nova.

func (f *fakeSources) LatestHost(context.Context) (*serverobs.HostMinute, error) {
	if len(f.host) == 0 {
		return nil, f.err
	}
	return &f.host[len(f.host)-1], f.err
}

func (f *fakeSources) RecentHost(context.Context, int) ([]serverobs.HostMinute, error) {
	return f.host, f.err
}

func (f *fakeSources) LatestAPI(context.Context) (*serverobs.APIMinute, error) {
	if len(f.api) == 0 {
		return nil, f.err
	}
	return &f.api[len(f.api)-1], f.err
}

func (f *fakeSources) RecentAPI(context.Context, int) ([]serverobs.APIMinute, error) {
	return f.api, f.err
}

func (f *fakeSources) Routes(_ context.Context, _, _ time.Time, limit int) ([]serverobs.RouteRow, error) {
	if len(f.routes) > limit {
		return f.routes[:limit], f.err
	}
	return f.routes, f.err
}

func (f *fakeSources) LastMinute(context.Context) (*time.Time, error) {
	return f.lastMinute, f.err
}

func (f *fakeSources) PreviousBackup(context.Context, time.Time) (*Backup, error) {
	f.backupCalls++
	return f.prevBackup, f.err
}

func (f *fakeSources) PeakEgress(context.Context, time.Time) (*Peak, error) {
	f.peakCalls++
	return f.peak, f.err
}

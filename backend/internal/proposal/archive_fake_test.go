package proposal

import (
	"context"
	"slices"
	"strings"
)

func (f *fakeStore) Archive(_ context.Context, ids []string) ([]string, error) {
	var out []string
	for _, id := range ids {
		if p, ok := f.items[id]; ok && p.ArchivedAt == nil && (p.Status == StatusDone || p.Status == StatusRejected) {
			at := t0
			p.ArchivedAt = &at
			out = append(out, id)
		}
	}
	return out, nil
}

func (f *fakeStore) ArchiveByStatus(ctx context.Context, status string) ([]string, error) {
	var ids []string
	for id, p := range f.items {
		if p.Status == status {
			ids = append(ids, id)
		}
	}
	slices.Sort(ids)
	return f.Archive(ctx, ids)
}

func (f *fakeStore) Unarchive(_ context.Context, id string) (bool, error) {
	p, ok := f.items[id]
	if !ok || p.ArchivedAt == nil {
		return false, nil
	}
	p.ArchivedAt = nil
	return true, nil
}

func (f *fakeStore) ListArchived(_ context.Context, viewerID, q string, limit, offset int) ([]Proposal, bool, error) {
	var all []Proposal
	for _, p := range f.items {
		if p.ArchivedAt != nil && strings.Contains(strings.ToLower(p.Title), strings.ToLower(q)) {
			all = append(all, *f.view(p, &viewerID))
		}
	}
	slices.SortFunc(all, func(a, b Proposal) int { return strings.Compare(a.ID, b.ID) })
	if offset > len(all) {
		offset = len(all)
	}
	all = all[offset:]
	more := len(all) > limit
	if more {
		all = all[:limit]
	}
	return all, more, nil
}

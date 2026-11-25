package serverobs

import (
	"os"
	"path/filepath"
	"time"
)

// backupPattern: o nome que o deploy/concord-backup.service dá ao dump pronto.
// O .tmp (dump em andamento ou que falhou) não conta.
const backupPattern = "concord-*.sql.gz"

// newestFile: hora e tamanho do backup pronto mais novo da pasta (nil sem a
// pasta, como em dev, ou sem backup).
func newestFile(dir string) (*time.Time, *int64) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, nil
	}
	var at *time.Time
	var size *int64
	for _, e := range entries {
		if ok, _ := filepath.Match(backupPattern, e.Name()); !ok {
			continue
		}
		info, err := e.Info()
		if err != nil || !info.Mode().IsRegular() {
			continue
		}
		if mod := info.ModTime(); at == nil || mod.After(*at) {
			at, size = &mod, ptr(info.Size())
		}
	}
	return at, size
}

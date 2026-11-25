package serverobs

import (
	"os"
	"time"
)

// newestFile: hora e tamanho do arquivo mais novo da pasta de backups (nil
// sem a pasta, como em dev, ou sem arquivo).
func newestFile(dir string) (*time.Time, *int64) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, nil
	}
	var at *time.Time
	var size *int64
	for _, e := range entries {
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

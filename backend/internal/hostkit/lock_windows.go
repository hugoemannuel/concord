//go:build windows

package hostkit

import (
	"os"

	"golang.org/x/sys/windows"
)

// lockFile segura uma trava exclusiva no arquivo enquanto o processo vive (o
// sistema solta sozinho se ele morrer).
func lockFile(path string) (*os.File, error) {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, err
	}
	ol := new(windows.Overlapped)
	flags := uint32(windows.LOCKFILE_EXCLUSIVE_LOCK | windows.LOCKFILE_FAIL_IMMEDIATELY)
	if err := windows.LockFileEx(windows.Handle(f.Fd()), flags, 0, 1, 0, ol); err != nil {
		_ = f.Close()
		return nil, ErrAlreadyRunning
	}
	return f, nil
}

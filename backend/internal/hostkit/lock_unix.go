//go:build !windows

package hostkit

import (
	"os"
	"syscall"
)

// lockFile segura uma trava exclusiva no arquivo enquanto o processo vive (o
// sistema solta sozinho se ele morrer).
func lockFile(path string) (*os.File, error) {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, err
	}
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		_ = f.Close()
		return nil, ErrAlreadyRunning
	}
	return f, nil
}

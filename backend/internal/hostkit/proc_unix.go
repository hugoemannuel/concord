//go:build !windows

package hostkit

import (
	"os"
	"os/exec"
	"syscall"
)

// Grupo próprio e, no Linux, SIGTERM se o supervisor morrer (sem órfãos
// segurando as portas).
func prepareChild(cmd *exec.Cmd) {
	cmd.SysProcAttr = childAttr()
}

// prepareDetached: o supervisor aberto pelo setup segue vivo depois que o app fecha.
func prepareDetached(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
}

func adoptChild(*os.Process) {}

func terminate(p *os.Process) error {
	return p.Signal(syscall.SIGTERM)
}

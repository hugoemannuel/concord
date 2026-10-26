//go:build windows

package hostkit

import (
	"os"
	"os/exec"
	"sync"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Sem janela de console e num grupo próprio. O Postgres no Windows morre
// (0xC0000142) se o console de quem o abriu some, então nenhum filho herda
// console.
func prepareChild(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: windows.CREATE_NO_WINDOW | windows.CREATE_NEW_PROCESS_GROUP,
		HideWindow:    true,
	}
}

// prepareDetached: o supervisor (salinha-host run) aberto pelo setup segue
// vivo depois que o app fecha.
func prepareDetached(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: windows.DETACHED_PROCESS | windows.CREATE_NEW_PROCESS_GROUP | windows.CREATE_BREAKAWAY_FROM_JOB,
		HideWindow:    true,
	}
}

var (
	jobOnce sync.Once
	job     windows.Handle
)

// adoptChild põe o filho num Job Object que mata todos quando o supervisor
// morre (sem Postgres/LiveKit órfãos segurando as portas).
func adoptChild(p *os.Process) {
	jobOnce.Do(func() {
		h, err := windows.CreateJobObject(nil, nil)
		if err != nil {
			return
		}
		info := windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION{}
		info.BasicLimitInformation.LimitFlags = windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
		if _, err := windows.SetInformationJobObject(h, windows.JobObjectExtendedLimitInformation,
			uintptr(unsafe.Pointer(&info)), uint32(unsafe.Sizeof(info))); err != nil {
			_ = windows.CloseHandle(h)
			return
		}
		job = h
	})
	if job == 0 {
		return
	}
	ph, err := windows.OpenProcess(windows.PROCESS_SET_QUOTA|windows.PROCESS_TERMINATE, false, uint32(p.Pid))
	if err != nil {
		return
	}
	defer windows.CloseHandle(ph)
	_ = windows.AssignProcessToJobObject(job, ph)
}

// terminate: no Windows não há SIGTERM; quem precisa parar com calma (backend,
// Postgres) tem caminho próprio (stdin fechado, pg_ctl stop).
func terminate(p *os.Process) error {
	return p.Kill()
}

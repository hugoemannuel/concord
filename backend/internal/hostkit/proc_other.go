//go:build !windows && !linux

package hostkit

import "syscall"

func childAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{Setpgid: true}
}

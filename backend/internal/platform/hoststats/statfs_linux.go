//go:build linux

package hoststats

import "syscall"

// statfs: espaço e inodes da partição de path.
func statfs(path string) (DiskSpace, error) {
	var st syscall.Statfs_t
	if err := syscall.Statfs(path, &st); err != nil {
		return DiskSpace{}, err
	}
	return space(st.Blocks, st.Bfree, st.Bavail, uint64(st.Bsize), st.Files, st.Ffree)
}

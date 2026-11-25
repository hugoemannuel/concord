//go:build !linux

package hoststats

import "errors"

// statfs: fora do Linux (Windows em dev) o disco fica sem número.
func statfs(string) (DiskSpace, error) {
	return DiskSpace{}, errors.New("hoststats: statfs só no Linux")
}

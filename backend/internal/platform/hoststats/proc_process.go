package hoststats

import (
	"bufio"
	"bytes"
	"strconv"
	"strings"
)

// parseProcessTicks: utime + stime do /proc/<pid>/stat (ticks). O nome vem
// entre parênteses e pode ter espaço: as colunas contam depois do último ")".
func parseProcessTicks(stat []byte) (uint64, error) {
	i := bytes.LastIndexByte(stat, ')')
	if i < 0 {
		return 0, errFormat
	}
	f := strings.Fields(string(stat[i+1:]))
	// Depois do ")": estado(0) ... utime(11) stime(12).
	if len(f) < 13 {
		return 0, errFormat
	}
	utime, err1 := strconv.ParseUint(f[11], 10, 64)
	stime, err2 := strconv.ParseUint(f[12], 10, 64)
	if err1 != nil || err2 != nil {
		return 0, errFormat
	}
	return utime + stime, nil
}

// processMemory: do /proc/<pid>/status, em kB.
type processMemory struct{ rssKB, anonKB, shmemKB uint64 }

func parseProcessMemory(status []byte) processMemory {
	var m processMemory
	fields := map[string]*uint64{"VmRSS": &m.rssKB, "RssAnon": &m.anonKB, "RssShmem": &m.shmemKB}
	scanner := bufio.NewScanner(bytes.NewReader(status))
	for scanner.Scan() {
		key, rest, _ := strings.Cut(scanner.Text(), ":")
		if dst, ok := fields[key]; ok {
			*dst, _ = strconv.ParseUint(strings.Fields(rest + " 0")[0], 10, 64)
		}
	}
	return m
}

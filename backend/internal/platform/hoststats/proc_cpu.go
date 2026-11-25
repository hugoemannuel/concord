package hoststats

import (
	"bytes"
	"strconv"
	"strings"
)

type cpuTimes struct{ busy, total uint64 }

// parseCPU: a linha "cpu" agregada; ocioso = idle + iowait.
func parseCPU(stat []byte) (cpuTimes, error) {
	line, _, _ := bytes.Cut(stat, []byte("\n"))
	fields := strings.Fields(string(line))
	if len(fields) < 5 || fields[0] != "cpu" {
		return cpuTimes{}, errFormat
	}
	var t cpuTimes
	for i, f := range fields[1:] {
		v, err := strconv.ParseUint(f, 10, 64)
		if err != nil {
			return cpuTimes{}, errFormat
		}
		t.total += v
		if i != 3 && i != 4 { // idle, iowait
			t.busy += v
		}
	}
	return t, nil
}

package hoststats

import (
	"bufio"
	"bytes"
	"strconv"
	"strings"
	"time"
)

// cpuTimes: a linha "cpu" do /proc/stat (todas as vCPUs), em ticks.
type cpuTimes struct{ busy, total, iowait, steal uint64 }

// Colunas: user nice system idle iowait irq softirq steal guest guest_nice.
// guest e guest_nice já estão dentro de user e nice: ficam fora do total.
const (
	colIdle   = 3
	colIOWait = 4
	colSteal  = 7
	cpuCols   = 8
)

// parseCPU: a linha "cpu" agregada; ocioso = idle + iowait.
func parseCPU(stat []byte) (cpuTimes, error) {
	line, _, _ := bytes.Cut(stat, []byte("\n"))
	fields := strings.Fields(string(line))
	if len(fields) < 5 || fields[0] != "cpu" {
		return cpuTimes{}, errFormat
	}
	var t cpuTimes
	for i, f := range fields[1:min(len(fields), cpuCols+1)] {
		v, err := strconv.ParseUint(f, 10, 64)
		if err != nil {
			return cpuTimes{}, errFormat
		}
		t.add(i, v)
	}
	return t, nil
}

func (t *cpuTimes) add(col int, v uint64) {
	t.total += v
	switch col {
	case colIdle:
	case colIOWait:
		t.iowait = v
	case colSteal:
		t.steal = v
		t.busy += v
	default:
		t.busy += v
	}
}

// parseBootTime: "btime <segundos desde 1970>" do /proc/stat.
func parseBootTime(stat []byte) (time.Time, error) {
	scanner := bufio.NewScanner(bytes.NewReader(stat))
	for scanner.Scan() {
		if rest, ok := strings.CutPrefix(scanner.Text(), "btime "); ok {
			secs, err := strconv.ParseInt(strings.TrimSpace(rest), 10, 64)
			if err != nil {
				return time.Time{}, errFormat
			}
			return time.Unix(secs, 0), nil
		}
	}
	return time.Time{}, errFormat
}

// Load: carga média de 1, 5 e 15 minutos (/proc/loadavg).
type Load struct{ One, Five, Fifteen float64 }

func parseLoadAvg(data []byte) (Load, error) {
	fields := strings.Fields(string(data))
	if len(fields) < 3 {
		return Load{}, errFormat
	}
	var v [3]float64
	for i := range v {
		f, err := strconv.ParseFloat(fields[i], 64)
		if err != nil {
			return Load{}, errFormat
		}
		v[i] = f
	}
	return Load{One: v[0], Five: v[1], Fifteen: v[2]}, nil
}

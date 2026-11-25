package hoststats

import (
	"bufio"
	"bytes"
	"path/filepath"
	"strconv"
	"strings"
)

// diskCounters: setores lidos/escritos (sempre de 512 bytes) e ms com E/S
// em andamento (/proc/diskstats).
type diskCounters struct{ readSectors, writeSectors, ioMs uint64 }

const sectorBytes = 512

// mountOf: o "major:minor" e a origem (ex. /dev/vda1) do ponto de montagem
// mais longo que contém path (/proc/self/mountinfo).
func mountOf(mountinfo []byte, path string) (dev, source string) {
	best := -1
	scanner := bufio.NewScanner(bytes.NewReader(mountinfo))
	for scanner.Scan() {
		mount, d, src, ok := mountLine(scanner.Text())
		if ok && contains(mount, path) && len(mount) > best {
			best, dev, source = len(mount), d, src
		}
	}
	return dev, source
}

// mountLine: "id pai major:minor raiz ponto opções ... - tipo origem ...".
func mountLine(line string) (mount, dev, source string, ok bool) {
	head, tail, found := strings.Cut(line, " - ")
	f, t := strings.Fields(head), strings.Fields(tail)
	if !found || len(f) < 5 || len(t) < 2 {
		return "", "", "", false
	}
	return f[4], f[2], t[1], true
}

func contains(mount, path string) bool {
	return mount == "/" || path == mount || strings.HasPrefix(path, mount+"/")
}

// parseDiskstats: a linha do dispositivo (pelo major:minor; senão pelo nome da
// origem, ex. /dev/vda1 → vda1). Colunas: major minor nome, leituras, mescladas,
// setores lidos, ms lendo, escritas, mescladas, setores escritos, ms escrevendo,
// em andamento, ms com E/S.
func parseDiskstats(data []byte, dev, source string) (diskCounters, bool) {
	name := filepath.Base(source)
	scanner := bufio.NewScanner(bytes.NewReader(data))
	for scanner.Scan() {
		f := strings.Fields(scanner.Text())
		if len(f) < 13 || (f[0]+":"+f[1] != dev && f[2] != name) {
			continue
		}
		return diskLine(f)
	}
	return diskCounters{}, false
}

func diskLine(f []string) (diskCounters, bool) {
	var v [3]uint64
	for i, col := range []int{5, 9, 12} {
		n, err := strconv.ParseUint(f[col], 10, 64)
		if err != nil {
			return diskCounters{}, false
		}
		v[i] = n
	}
	return diskCounters{readSectors: v[0], writeSectors: v[1], ioMs: v[2]}, true
}

// DiskSpace: espaço da partição (como o df: % sobre o que o usuário pode usar).
type DiskSpace struct {
	UsedBytes, FreeBytes uint64
	UsedPercent          float64
	// InodesUsedPercent: nil em sistemas de arquivos sem inodes fixos (btrfs).
	InodesUsedPercent *float64
}

// space: blocos (total, livres, disponíveis ao usuário) × tamanho, e inodes.
func space(blocks, free, avail, size, files, filesFree uint64) (DiskSpace, error) {
	if blocks == 0 || size == 0 {
		return DiskSpace{}, errFormat
	}
	used := (blocks - free) * size
	s := DiskSpace{UsedBytes: used, FreeBytes: avail * size}
	s.UsedPercent = float64(used) * 100 / float64(used+s.FreeBytes)
	if files > 0 {
		pct := float64(files-filesFree) * 100 / float64(files)
		s.InodesUsedPercent = &pct
	}
	return s, nil
}

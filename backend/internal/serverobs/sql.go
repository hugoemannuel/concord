package serverobs

import (
	"strconv"
	"strings"
)

// placeholders: "$1,$2,...,$n".
func placeholders(n int) string {
	var b strings.Builder
	for i := 1; i <= n; i++ {
		if i > 1 {
			b.WriteByte(',')
		}
		b.WriteString("$" + strconv.Itoa(i))
	}
	return b.String()
}

// upsertSQL: INSERT que substitui a linha da mesma chave (coleta dupla no
// mesmo minuto, ou o processo novo no minuto do antigo).
func upsertSQL(table, columns, key string, n int) string {
	return `INSERT INTO ` + table + ` (` + columns + `) VALUES (` + placeholders(n) + `)
		ON CONFLICT (` + key + `) DO UPDATE SET (` + columns + `) = ROW(EXCLUDED.*)`
}

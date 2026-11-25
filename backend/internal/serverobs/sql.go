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
// mesmo minuto, ou o processo novo no minuto do antigo), coluna a coluna (uma
// coluna nova na tabela não quebra o INSERT).
func upsertSQL(table, columns, key string) string {
	cols := strings.Split(columns, ",")
	set := make([]string, len(cols))
	for i, c := range cols {
		c = strings.TrimSpace(c)
		set[i] = c + " = EXCLUDED." + c
	}
	return `INSERT INTO ` + table + ` (` + columns + `) VALUES (` + placeholders(len(cols)) + `)
		ON CONFLICT (` + key + `) DO UPDATE SET ` + strings.Join(set, ", ")
}

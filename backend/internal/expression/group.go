package expression

// Rows é o que ScanGroups usa das linhas de uma consulta (pgx.Rows serve).
type Rows interface {
	Next() bool
	Err() error
}

// Grouping diz de qual servidor é um grupo (G) e onde ficam os itens (I) dele.
type Grouping[G, I any] struct {
	Key   func(*G) string
	Items func(*G) *[]I
}

// ScanGroups lê as linhas, já ordenadas por servidor, de uma listagem
// agrupada (emojis, figurinhas e sons de todos os servidores da pessoa). scan
// lê a linha atual e devolve o grupo e o item dela; o item entra no último
// grupo quando é do mesmo servidor, senão abre um grupo novo. Sem linhas, a
// lista vem vazia (não nil), para virar [] no JSON.
func ScanGroups[G, I any](rows Rows, scan func() (G, I, error), by Grouping[G, I]) ([]G, error) {
	groups := make([]G, 0)
	for rows.Next() {
		g, item, err := scan()
		if err != nil {
			return nil, err
		}
		groups = by.add(groups, g, item)
	}
	return groups, rows.Err()
}

// add põe o item no último grupo, se é do mesmo servidor, ou abre o grupo g.
func (by Grouping[G, I]) add(groups []G, g G, item I) []G {
	if n := len(groups); n > 0 && by.Key(&groups[n-1]) == by.Key(&g) {
		last := by.Items(&groups[n-1])
		*last = append(*last, item)
		return groups
	}
	*by.Items(&g) = []I{item}
	return append(groups, g)
}

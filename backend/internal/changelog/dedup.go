package changelog

// Cada nota vem de um arquivo em changelog/pending/ (Entry.Source). O CI não
// consegue apagar os arquivos já publicados do git, então o deploy reenvia
// todos; a release guarda só os que nenhuma mais antiga trouxe. A identidade é
// o arquivo, não o texto: reescrever uma nota publicada não a faz voltar.

// olderThan devolve as releases anteriores a version. releases vem do store, da
// mais nova para a mais antiga; se version já existe, só contam as que vêm
// depois dela (repetir o deploy dá o mesmo resultado).
func olderThan(releases []Release, version string) []Release {
	for i, r := range releases {
		if r.Version == version {
			return releases[i+1:]
		}
	}
	return releases
}

func publishedSources(releases []Release) map[string]bool {
	published := map[string]bool{}
	for _, r := range releases {
		for _, e := range r.Entries {
			if e.Source != "" {
				published[e.Source] = true
			}
		}
	}
	return published
}

// newEntries tira de entries as notas cuja origem já saiu numa release mais
// antiga que version e as repetidas dentro do próprio envio.
func newEntries(releases []Release, version string, entries []Entry) []Entry {
	published := publishedSources(olderThan(releases, version))
	seen := map[Entry]bool{}
	kept := []Entry{}
	for _, e := range entries {
		if published[e.Source] || seen[e] {
			continue
		}
		seen[e] = true
		kept = append(kept, e)
	}
	return kept
}

// withoutSources tira a origem (e a marca de obrigatória, que só vale no PUT)
// das notas antes de mostrá-las: são detalhes do deploy.
func withoutSources(releases []Release) []Release {
	shown := make([]Release, len(releases))
	for i, r := range releases {
		shown[i] = r
		shown[i].Entries = make([]Entry, len(r.Entries))
		for j, e := range r.Entries {
			e.Source = ""
			e.Required = false
			shown[i].Entries[j] = e
		}
	}
	return shown
}

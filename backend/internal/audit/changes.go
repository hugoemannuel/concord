package audit

// Diff acrescenta a mudança de field quando antes e depois diferem.
func Diff[T comparable](changes []Change, field string, before, after T) []Change {
	if before == after {
		return changes
	}
	return append(changes, Change{Field: field, Before: before, After: after})
}

// DiffPtr é o Diff de campos opcionais: nil vira "sem valor" (fica fora do JSON).
func DiffPtr[T comparable](changes []Change, field string, before, after *T) []Change {
	if equalPtr(before, after) {
		return changes
	}
	return append(changes, Change{Field: field, Before: valueOf(before), After: valueOf(after)})
}

func equalPtr[T comparable](a, b *T) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}

func valueOf[T any](p *T) any {
	if p == nil {
		return nil
	}
	return *p
}

// ValidAction: a ação está no catálogo.
func ValidAction(a Action) bool {
	for _, known := range Actions {
		if a == known {
			return true
		}
	}
	return false
}

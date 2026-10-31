// Package accountdeletion exclui a própria conta (LGPD art. 18, VI):
// docs/adr/0038-excluir-a-propria-conta.md.
package accountdeletion

import "errors"

// DeletedUserID é a conta "Usuário removido" (migration 000184): as mensagens
// que ficam em servidores e grupos passam para ela.
const DeletedUserID = "00000000-0000-4000-8000-000000000000"

var (
	// ErrNotFound: a conta não existe (ou é a própria "Usuário removido").
	ErrNotFound = errors.New("conta não encontrada")
	// ErrOwnsServers: é dono de servidor com outros membros. O erro de verdade
	// é um *OwnsServersError, com a lista.
	ErrOwnsServers = errors.New("transfira a posse ou apague os servidores que têm outros membros antes de excluir a conta")
)

// OwnedServer é um servidor que impede a exclusão.
type OwnedServer struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// OwnsServersError lista os servidores com membros de que a pessoa é dona.
type OwnsServersError struct{ Servers []OwnedServer }

func (e *OwnsServersError) Error() string { return ErrOwnsServers.Error() }
func (e *OwnsServersError) Unwrap() error { return ErrOwnsServers }

// FileKind diz em que pasta de UPLOADS_DIR o arquivo está.
type FileKind string

const (
	KindProfile    FileKind = "profile"    // avatar, banner, faixa, ícone de servidor (+ quadro parado)
	KindEntrance   FileKind = "entrance"   // som de entrada na call
	KindAppSound   FileKind = "appsound"   // sons personalizados do app
	KindSoundboard FileKind = "soundboard" // sons da mesa de áudio
	KindSticker    FileKind = "sticker"    // figurinhas
	KindEmoji      FileKind = "emoji"      // emojis de servidor
	KindProposal   FileKind = "proposal"   // imagens e anexos das propostas
)

// File é um arquivo a apagar do disco depois do commit (nome = id).
type File struct {
	Kind FileKind
	ID   string
}

// Erasure é o que a exclusão apagou e precisa de efeito fora do banco.
type Erasure struct {
	Files []File
	// DeletedServers: servidores em que a pessoa era o único membro.
	DeletedServers []string
	// LeftServers: servidores de outras pessoas de que ela era membro (o cache
	// de permissões e a lista de membros precisam saber da saída).
	LeftServers []string
}

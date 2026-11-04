package memberprofile

import (
	"context"
	"log"
	"strings"
	"time"

	"gin-quickstart/backend/internal/cosmetics"
	"gin-quickstart/backend/internal/namestyle"
	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/profiletheme"
	"gin-quickstart/backend/internal/user"
)

type store interface {
	Find(ctx context.Context, serverID, userID string) (Overrides, error)
	Nickname(ctx context.Context, serverID, userID string) (*string, error)
	GlobalNameplate(ctx context.Context, userID string) (*string, error)
	Mutate(ctx context.Context, serverID, userID string, change func(*Overrides) error) error
	Delete(ctx context.Context, serverID, userID string) error
	TakeTrash(ctx context.Context) ([]string, error)
}

type snapshots interface {
	Snapshot(ctx context.Context, serverID string) (*permission.Snapshot, error)
}

// Publisher avisa o servidor inteiro que o perfil de alguém mudou.
type Publisher interface {
	PublishMemberProfile(ctx context.Context, serverID, userID string)
}

// MediaRemover apaga o arquivo de uma URL, se ninguém mais usar (ADR 0011).
type MediaRemover interface {
	RemoveMediaURL(url *string)
}

// Service edita o perfil do próprio membro. Quem não é membro não tem perfil;
// CHANGE_NICKNAME só controla o nome (o apelido, em internal/server).
type Service struct {
	store     store
	perms     snapshots
	publisher Publisher
	media     MediaRemover
}

func NewService(repo store, perms snapshots, publisher Publisher, media MediaRemover) *Service {
	return &Service{store: repo, perms: perms, publisher: publisher, media: media}
}

// RequireMember recusa quem não é membro (antes de gastar disco com upload).
func (s *Service) RequireMember(ctx context.Context, serverID, userID string) error {
	_, err := s.memberSnapshot(ctx, serverID, userID)
	return err
}

func (s *Service) memberSnapshot(ctx context.Context, serverID, userID string) (*permission.Snapshot, error) {
	snap, err := s.perms.Snapshot(ctx, serverID)
	if err != nil {
		return nil, err
	}
	if !snap.IsMember(userID) {
		return nil, ErrNotMember
	}
	return snap, nil
}

// View monta o que o editor mostra do servidor.
func (s *Service) View(ctx context.Context, serverID, userID string) (View, error) {
	snap, err := s.memberSnapshot(ctx, serverID, userID)
	if err != nil {
		return View{}, err
	}
	profile, err := s.store.Find(ctx, serverID, userID)
	if err != nil {
		return View{}, err
	}
	nick, err := s.store.Nickname(ctx, serverID, userID)
	if err != nil {
		return View{}, err
	}
	return View{
		ServerID:          serverID,
		UserID:            userID,
		Profile:           SelfOverrides{Overrides: profile, NameplateCustomURL: profile.NameplateCustomURL},
		HasProfile:        !profile.Empty(),
		Nickname:          nick,
		CanChangeNickname: permission.Has(snap.Server(userID), permission.ChangeNickname),
	}, nil
}

// Update aplica o PATCH: as regras são as do perfil global, campo a campo.
func (s *Service) Update(ctx context.Context, serverID, userID string, patch Patch) (View, error) {
	if _, err := s.memberSnapshot(ctx, serverID, userID); err != nil {
		return View{}, err
	}
	clean, err := patch.validated()
	if err != nil {
		return View{}, err
	}
	if err := s.requireNameplateImage(ctx, serverID, userID, clean); err != nil {
		return View{}, err
	}
	err = s.store.Mutate(ctx, serverID, userID, func(o *Overrides) error {
		clean.applyTo(o)
		return nil
	})
	return s.changed(ctx, serverID, userID, err)
}

// SetMedia grava a URL nova (nil volta ao padrão) e devolve a antiga para quem
// chama apagar o arquivo.
func (s *Service) SetMedia(ctx context.Context, serverID, userID string, kind MediaKind, url *string) (View, *string, error) {
	if _, err := s.memberSnapshot(ctx, serverID, userID); err != nil {
		return View{}, nil, err
	}
	var old *string
	err := s.store.Mutate(ctx, serverID, userID, func(o *Overrides) error {
		old = o.setMedia(kind, url)
		return nil
	})
	view, err := s.changed(ctx, serverID, userID, err)
	if err != nil {
		return View{}, nil, err
	}
	return view, old, nil
}

// Delete apaga o perfil do servidor: a pessoa volta a ser só o perfil global.
// Os arquivos saem pela caixa de saída, como em todo outro caminho.
func (s *Service) Delete(ctx context.Context, serverID, userID string) (View, error) {
	if _, err := s.memberSnapshot(ctx, serverID, userID); err != nil {
		return View{}, err
	}
	err := s.store.Delete(ctx, serverID, userID)
	view, err := s.changed(ctx, serverID, userID, err)
	if err == nil {
		s.SweepMedia(ctx)
	}
	return view, err
}

func (s *Service) changed(ctx context.Context, serverID, userID string, err error) (View, error) {
	if err != nil {
		return View{}, err
	}
	if s.publisher != nil {
		s.publisher.PublishMemberProfile(ctx, serverID, userID)
	}
	return s.View(ctx, serverID, userID)
}

// requireNameplateImage: como no global, a faixa "custom" exige uma imagem
// guardada (a deste servidor ou, herdando, a global).
func (s *Service) requireNameplateImage(ctx context.Context, serverID, userID string, patch Patch) error {
	if patch.NameplateMode.Value == nil || *patch.NameplateMode.Value != cosmetics.ModeCustom {
		return nil
	}
	profile, err := s.store.Find(ctx, serverID, userID)
	if err != nil {
		return err
	}
	if profile.NameplateCustomURL != nil {
		return nil
	}
	global, err := s.store.GlobalNameplate(ctx, userID)
	if err != nil {
		return err
	}
	if global == nil {
		return user.InvalidProfile("envie uma imagem para a faixa")
	}
	return nil
}

// validated confere só os campos que vieram com valor (null = volta ao padrão
// e não tem o que conferir) e devolve o PATCH arrumado.
func (p Patch) validated() (Patch, error) {
	trim := func(f Field[string]) Field[string] {
		if f.Value == nil {
			return f
		}
		v := strings.TrimSpace(*f.Value)
		return Field[string]{Set: f.Set, Value: &v}
	}
	p.Pronouns, p.Bio, p.StatusText = trim(p.Pronouns), trim(p.Bio), trim(p.StatusText)
	if err := user.ValidateTextFields(deref(p.Pronouns.Value), deref(p.Bio.Value), deref(p.StatusText.Value)); err != nil {
		return Patch{}, err
	}
	steps := []func(*Patch) error{(*Patch).cleanColor, (*Patch).cleanLinks, (*Patch).cleanStyle, (*Patch).cleanTheme, (*Patch).cleanMode}
	for _, step := range steps {
		if err := step(&p); err != nil {
			return Patch{}, err
		}
	}
	return p, nil
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func (p *Patch) cleanColor() error {
	if p.BannerColor.Value == nil {
		return nil
	}
	color, err := user.NormalizeBannerColor(*p.BannerColor.Value)
	if err != nil {
		return err
	}
	p.BannerColor.Value = &color
	return nil
}

func (p *Patch) cleanLinks() error {
	if p.Links.Value == nil {
		return nil
	}
	links, err := user.NormalizeLinks(*p.Links.Value)
	if err != nil {
		return err
	}
	p.Links.Value = &links
	return nil
}

func (p *Patch) cleanStyle() error {
	if p.NameStyle.Value == nil {
		return nil
	}
	style, err := namestyle.Validate(*p.NameStyle.Value)
	if err != nil {
		return user.InvalidProfile(err.Error())
	}
	p.NameStyle.Value = &style
	return nil
}

func (p *Patch) cleanTheme() error {
	if p.ProfileTheme.Value == nil {
		return nil
	}
	theme, err := profiletheme.Validate(*p.ProfileTheme.Value)
	if err != nil {
		return user.InvalidProfile(err.Error())
	}
	p.ProfileTheme.Value = &theme
	return nil
}

func (p *Patch) cleanMode() error {
	if p.NameplateMode.Value != nil && !cosmetics.ValidMode(*p.NameplateMode.Value) {
		return user.InvalidProfile("modo da faixa desconhecido")
	}
	return nil
}

func set[T any](dst **T, f Field[T]) {
	if f.Set {
		*dst = f.Value
	}
}

func (p Patch) applyTo(o *Overrides) {
	set(&o.BannerColor, p.BannerColor)
	set(&o.Pronouns, p.Pronouns)
	set(&o.Bio, p.Bio)
	set(&o.StatusText, p.StatusText)
	set(&o.Links, p.Links)
	set(&o.NameStyle, p.NameStyle)
	set(&o.ProfileTheme, p.ProfileTheme)
	set(&o.NameplateMode, p.NameplateMode)
}

// setMedia troca a imagem e devolve a que estava. Na faixa, enviar liga a
// imagem própria; apagar a que estava em uso volta a herdar o modo global.
func (o *Overrides) setMedia(kind MediaKind, url *string) *string {
	slots := map[MediaKind]**string{
		MediaAvatar:     &o.AvatarURL,
		MediaBanner:     &o.BannerURL,
		MediaNameplate:  &o.NameplateCustomURL,
		MediaDecoration: &o.AvatarDecorationURL,
	}
	slot := slots[kind]
	old := *slot
	*slot = url
	if kind == MediaNameplate {
		o.NameplateMode = modeAfterMedia(o.NameplateMode, url)
	}
	return old
}

func modeAfterMedia(mode, url *string) *string {
	if url != nil {
		custom := cosmetics.ModeCustom
		return &custom
	}
	if mode != nil && *mode == cosmetics.ModeCustom {
		return nil
	}
	return mode
}

// SweepInterval: de quanto em quanto a caixa de saída de arquivos é esvaziada.
const SweepInterval = 10 * time.Minute

// SweepMedia apaga os arquivos dos perfis que sumiram (saiu do servidor, foi
// expulso, apagou a conta...). O RemoveMediaURL confere se alguém ainda usa.
func (s *Service) SweepMedia(ctx context.Context) {
	urls, err := s.store.TakeTrash(ctx)
	if err != nil {
		log.Printf("[memberprofile] esvaziar a caixa de saída: %v", err)
		return
	}
	for _, url := range urls {
		s.media.RemoveMediaURL(&url)
	}
}

// RunMediaSweep esvazia agora e a cada every, até ctx acabar.
func (s *Service) RunMediaSweep(ctx context.Context, every time.Duration) {
	ticker := time.NewTicker(every)
	defer ticker.Stop()
	for {
		s.SweepMedia(ctx)
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

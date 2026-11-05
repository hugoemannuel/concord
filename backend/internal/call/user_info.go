package call

import (
	"context"

	"gin-quickstart/backend/internal/user"
)

// userInfo monta os dados públicos de quem está na chamada (vão nos eventos).
func (s *Service) userInfo(ctx context.Context, userID string) (UserInfo, error) {
	u, err := s.userService.FindByID(ctx, userID)
	if err != nil {
		return UserInfo{}, err
	}
	return userInfoOf(u), nil
}

// userInfoOf: o som de entrada vai junto para quem já está na call tocar o
// som da pessoa no call:joined, sem outra ida ao servidor.
func userInfoOf(u *user.User) UserInfo {
	return UserInfo{
		ID:               u.ID,
		Username:         u.Username,
		DisplayName:      u.DisplayName,
		AvatarURL:        u.AvatarURL,
		NameStyle:        u.NameStyle,
		Look:             u.Look,
		EntranceSoundURL: u.EntranceSoundURL,
	}
}

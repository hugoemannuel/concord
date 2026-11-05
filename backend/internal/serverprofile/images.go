package serverprofile

// ImagePath é onde as imagens do perfil são servidas (banner, faixa e fundo). O
// nome do arquivo é um UUID novo a cada envio; ver image_handler.go.
const (
	ImageDir  = "server-profile-images"
	ImagePath = "/api/server-profile-images/"
)

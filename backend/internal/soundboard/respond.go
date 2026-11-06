package soundboard

import "github.com/gin-gonic/gin"

// apiErr é a resposta de uma etapa que recusou o pedido.
type apiErr struct {
	status int
	body   gin.H
}

func fail(status int, msg string) *apiErr {
	return &apiErr{status: status, body: gin.H{"error": msg}}
}

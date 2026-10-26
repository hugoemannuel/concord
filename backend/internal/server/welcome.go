package server

import (
	"fmt"
	"math/rand/v2"
)

// WelcomeSystemKind marca a mensagem automática de boas-vindas no canal "avisos".
const WelcomeSystemKind = "welcome"

// WelcomeMessages tem 30 mensagens de boas-vindas estilo Discord, básicas e descontraídas.
// O "%s" recebe "@username".
var WelcomeMessages = []string{
	"👋 %s acabou de entrar no servidor — digam oi!",
	"🎉 %s acabou de aterrissar por aqui!",
	"🚀 %s chegou! Preparem as boas-vindas.",
	"🍕 %s entrou no servidor. Espero que tenha trazido pizza!",
	"✨ Um %s selvagem apareceu!",
	"🎮 %s entrou na partida!",
	"🔥 Que bom que você veio, %s!",
	"🎈 %s acabou de deslizar para dentro do servidor.",
	"🌟 Pessoal, dêem as boas-vindas para %s!",
	"🙌 Viva, você conseguiu chegar, %s!",
	"☕ %s chegou! Puxa uma cadeira e pega um café.",
	"🎊 %s pulou para dentro do servidor!",
	"⚡ %s apareceu de repente!",
	"🎧 %s entrou na roda. Bora pra call!",
	"🥳 Bem-vindo(a), %s! Estávamos esperando por você.",
	"🛸 %s acabou de se teletransportar para o servidor!",
	"🎺 Toquem as trombetas: %s chegou!",
	"😎 %s entrou no servidor. Deixem suas armas na porta.",
	"🍀 Olha só quem apareceu: bem-vindo(a), %s!",
	"🎯 %s chegou na área!",
	"🌈 Mais um integrante na família: seja bem-vindo(a), %s!",
	"🍿 %s chegou! Já pode pegar a pipoca.",
	"🕹️ Novo jogador conectado: %s!",
	"💫 %s brilhou e apareceu por aqui!",
	"🐾 %s entrou de mansinho no servidor. Oi!",
	"🎸 %s chegou para aumentar o som da galera!",
	"🏆 %s desbloqueou a conquista: entrou no servidor!",
	"🫡 Apresentem-se: %s acabou de chegar!",
	"🌊 %s pegou uma onda e parou aqui no servidor!",
	"🤝 Seja muito bem-vindo(a) ao servidor, %s!",
}

// FormatWelcomeMessage monta a mensagem de boas-vindas de índice index para @username.
func FormatWelcomeMessage(index int, username string) string {
	n := len(WelcomeMessages)
	idx := ((index % n) + n) % n
	return fmt.Sprintf(WelcomeMessages[idx], "@"+username)
}

// RandomWelcomeMessage sorteia uma das 30 mensagens de boas-vindas para @username.
func RandomWelcomeMessage(username string) string {
	return FormatWelcomeMessage(rand.IntN(len(WelcomeMessages)), username)
}

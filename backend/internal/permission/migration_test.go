package permission

import (
	"os"
	"regexp"
	"strconv"
	"strings"
	"testing"
)

// legacyModerator: as permissões de um cargo de moderação típico (as do antigo cargo
// Moderador, que servidor novo não cria mais). O USE_EXTERNAL_EMOJIS veio só no
// @everyone, que todo moderador também tem.
const legacyModerator = DefaultEveryone&^UseExternalEmojis | ManageChannels |
	ManageServer |
	MentionEveryone |
	ManageMessages |
	MoveMembers |
	MuteMembers |
	DeafenMembers |
	KickMembers |
	ManageExpressions |
	ManageNicknames |
	DisconnectMembers

// externalMigration: a que criou o USE_EXTERNAL_EMOJIS (ADR 0052).
const externalMigration = "000189_emojis_de_outros_servidores"

func readMigration(t *testing.T, name string) string {
	t.Helper()
	raw, err := os.ReadFile("../../migrations/" + name)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

// A migration 000029 grava os padrões da época como números e a 000039 liga
// os bits de apelido por cima. Somadas, têm que dar os padrões de hoje: se os
// bits mudarem aqui, elas têm que mudar junto.
func TestMigrationDefaultsMatchConstants(t *testing.T) {
	sql := readMigration(t, "000029_add_roles_permissions.up.sql")
	added := nicknameMigrationBits(t)
	disconnectBits := disconnectMigrationBits(t)
	ttsBits := roleUpdateBits(t, "000127_tts_messages.up.sql")
	emojiBits := roleUpdateBits(t, "000174_create_server_emojis.up.sql")
	externalBits := roleUpdateBits(t, externalMigration+".up.sql")
	for name, want := range map[string]int64{"@everyone": DefaultEveryone, "Moderador": legacyModerator} {
		needle := "'" + name + "', "
		i := strings.Index(sql, "SELECT id, "+needle)
		if i < 0 {
			t.Fatalf("INSERT do %s não encontrado", name)
		}
		fields := strings.Split(sql[i:strings.Index(sql[i:], "\n")+i], ", ")
		got, err := strconv.ParseInt(fields[3], 10, 64)
		if err != nil {
			t.Fatalf("%s: %v (%q)", name, err, fields)
		}
		total := got | added[name] | disconnectBits[name] | ttsBits[name] | emojiBits[name] | externalBits[name] | expressionMigrationBits(t, got)
		if total != want {
			t.Errorf("%s: migrations = %d, Go = %d", name, total, want)
		}
	}
}

// nicknameMigrationBits: o que a 000039 liga em cada cargo padrão.
func nicknameMigrationBits(t *testing.T) map[string]int64 {
	t.Helper()
	sql := readMigration(t, "000039_add_member_nicknames.up.sql")
	re := regexp.MustCompile(`UPDATE roles SET permissions = permissions \| (\d+) WHERE (.+);`)
	targets := map[string]string{
		"is_default":                            "@everyone",
		"name = 'Moderador' AND NOT is_default": "Moderador",
	}
	added := map[string]int64{}
	for _, m := range re.FindAllStringSubmatch(sql, -1) {
		name, ok := targets[m[2]]
		if !ok {
			t.Fatalf("UPDATE inesperado na 000039: %q", m[0])
		}
		bits, err := strconv.ParseInt(m[1], 10, 64)
		if err != nil {
			t.Fatal(err)
		}
		added[name] |= bits
	}
	if added["@everyone"] != ChangeNickname {
		t.Errorf("@everyone ganha %d na 000039, want CHANGE_NICKNAME (%d)", added["@everyone"], ChangeNickname)
	}
	if added["Moderador"] != ChangeNickname|ManageNicknames {
		t.Errorf("Moderador ganha %d na 000039, want os dois bits de apelido", added["Moderador"])
	}
	return added
}

// disconnectMigrationBits: o que a 000063 liga em cada cargo padrão.
func disconnectMigrationBits(t *testing.T) map[string]int64 {
	t.Helper()
	sql := readMigration(t, "000063_add_disconnect_members_permission.up.sql")
	re := regexp.MustCompile(`UPDATE roles SET permissions = permissions \| (\d+) WHERE (.+);`)
	targets := map[string]string{
		"name = 'Moderador' AND NOT is_default": "Moderador",
	}
	added := map[string]int64{}
	for _, m := range re.FindAllStringSubmatch(sql, -1) {
		name, ok := targets[m[2]]
		if !ok {
			t.Fatalf("UPDATE inesperado na 000063: %q", m[0])
		}
		bits, err := strconv.ParseInt(m[1], 10, 64)
		if err != nil {
			t.Fatal(err)
		}
		added[name] |= bits
	}
	if added["Moderador"] != DisconnectMembers {
		t.Errorf("Moderador ganha %d na 000063, want DisconnectMembers (%d)", added["Moderador"], DisconnectMembers)
	}
	return added
}

// roleUpdateBits: o que uma migration liga no @everyone e no Moderador antigo
// (só UPDATEs de "permissions | N").
func roleUpdateBits(t *testing.T, file string) map[string]int64 {
	t.Helper()
	re := regexp.MustCompile(`UPDATE roles SET permissions = permissions \| (\d+) WHERE (.+);`)
	targets := map[string]string{
		"is_default":                            "@everyone",
		"name = 'Moderador' AND NOT is_default": "Moderador",
	}
	added := map[string]int64{}
	for _, m := range re.FindAllStringSubmatch(readMigration(t, file), -1) {
		name, ok := targets[m[2]]
		if !ok {
			t.Fatalf("UPDATE inesperado na %s: %q", file, m[0])
		}
		bits, err := strconv.ParseInt(m[1], 10, 64)
		if err != nil {
			t.Fatal(err)
		}
		added[name] |= bits
	}
	return added
}

// expressionMigrationBits: o que a 000125 liga num cargo que tinha perms.
// Quem tinha USE_SOUNDBOARD (que bastava para enviar som) ganha ADD_SOUNDS; o
// @everyone (enviar figurinha só pedia ser membro) e o Moderador antigo
// ganham ADD_STICKERS.
func expressionMigrationBits(t *testing.T, perms int64) int64 {
	t.Helper()
	sql := readMigration(t, "000125_add_sounds_stickers_permissions.up.sql")
	sounds := strconv.FormatInt(AddSounds, 10)
	stickers := strconv.FormatInt(AddStickers, 10)
	for _, stmt := range []string{
		"UPDATE roles SET permissions = permissions | " + sounds + " WHERE permissions & " + strconv.FormatInt(UseSoundboard, 10) + " <> 0;",
		"UPDATE roles SET permissions = permissions | " + stickers + " WHERE is_default;",
		"UPDATE roles SET permissions = permissions | " + stickers + " WHERE name = 'Moderador' AND NOT is_default;",
	} {
		if !strings.Contains(sql, stmt) {
			t.Fatalf("000125 devia ter %q", stmt)
		}
	}
	added := AddStickers
	if perms&UseSoundboard != 0 {
		added |= AddSounds
	}
	return added
}

// A 000127 liga só o SEND_TTS_MESSAGES, nos dois cargos padrão, e o down o
// tira de todos os cargos e sobrescritas.
func TestTTSMigrationBits(t *testing.T) {
	added := roleUpdateBits(t, "000127_tts_messages.up.sql")
	if added["@everyone"] != SendTTSMessages || added["Moderador"] != SendTTSMessages {
		t.Errorf("000127 liga %v, want só SEND_TTS_MESSAGES (%d)", added, SendTTSMessages)
	}
	down := readMigration(t, "000127_tts_messages.down.sql")
	want := "& ~" + strconv.FormatInt(SendTTSMessages, 10)
	if strings.Count(down, want) != 3 {
		t.Errorf("down devia tirar o bit dos cargos e das sobrescritas (%q)", want)
	}
}

// A migration de usar emojis de outros servidores liga o bit só no @everyone e
// o down o tira de todos os cargos e sobrescritas.
func TestExternalEmojisMigrationBits(t *testing.T) {
	added := roleUpdateBits(t, externalMigration+".up.sql")
	if added["@everyone"] != UseExternalEmojis || added["Moderador"] != 0 {
		t.Errorf("liga %v, want só USE_EXTERNAL_EMOJIS (%d) no @everyone", added, UseExternalEmojis)
	}
	down := readMigration(t, externalMigration+".down.sql")
	want := "& ~" + strconv.FormatInt(UseExternalEmojis, 10)
	if strings.Count(down, want) != 3 {
		t.Errorf("down devia tirar o bit dos cargos e das sobrescritas (%q)", want)
	}
}

// App antigo manda o 1<<31 como número negativo (bitwise do JS com sinal); o
// servidor guarda o bit certo, sem sinal.
func TestNormalizeAceitaBitAltoComSinal(t *testing.T) {
	const signed = int64(-2147483648) // (1 << 31) no JS
	if got := Normalize(signed | SendMessages); got != UseExternalEmojis|SendMessages {
		t.Errorf("Normalize = %d, want %d", got, UseExternalEmojis|SendMessages)
	}
}

// O down da 000125 tira os dois bits dos cargos e das sobrescritas.
func TestExpressionMigrationDownClearsBits(t *testing.T) {
	sql := readMigration(t, "000125_add_sounds_stickers_permissions.down.sql")
	want := "& ~" + strconv.FormatInt(AddSounds|AddStickers, 10)
	if strings.Count(sql, want) != 3 {
		t.Errorf("down devia tirar os bits dos cargos e das sobrescritas (%q)", want)
	}
}

// O down da 000039 desliga exatamente os bits que o up ligou.
func TestNicknameMigrationDownClearsBits(t *testing.T) {
	sql := readMigration(t, "000039_add_member_nicknames.down.sql")
	want := "permissions & ~" + strconv.FormatInt(ChangeNickname|ManageNicknames, 10)
	if !strings.Contains(sql, want) {
		t.Errorf("down devia ter %q", want)
	}
}

// O down da 000063 desliga exatamente os bits que o up ligou.
func TestDisconnectMigrationDownClearsBits(t *testing.T) {
	sql := readMigration(t, "000063_add_disconnect_members_permission.down.sql")
	want := "permissions & ~" + strconv.FormatInt(DisconnectMembers, 10)
	if !strings.Contains(sql, want) {
		t.Errorf("down devia ter %q", want)
	}
}

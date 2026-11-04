-- Perfil por servidor (issue #529, ADR 0051): só o que a pessoa sobrescreveu
-- naquele servidor. NULL = herda do perfil global. O nome não mora aqui: é o
-- apelido (server_members.nickname), com as permissões que ele já tem.
-- A FK para server_members leva o perfil junto quando a pessoa sai, é
-- removida, banida, apaga a conta ou o servidor é apagado.
CREATE TABLE server_member_profiles (
    server_id UUID NOT NULL,
    user_id UUID NOT NULL,
    avatar_url TEXT,
    banner_url TEXT,
    banner_color TEXT,
    pronouns TEXT,
    bio TEXT,
    status_text TEXT,
    links JSONB,
    name_style JSONB,
    profile_theme JSONB,
    nameplate_mode TEXT CHECK (nameplate_mode IN ('off', 'banner', 'custom')),
    nameplate_url TEXT,
    avatar_decoration_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (server_id, user_id),
    FOREIGN KEY (server_id, user_id) REFERENCES server_members (server_id, user_id) ON DELETE CASCADE
);

-- A limpeza da mídia pergunta "alguém ainda usa esta URL?" (ADR 0011).
CREATE INDEX idx_smp_avatar ON server_member_profiles (avatar_url) WHERE avatar_url IS NOT NULL;
CREATE INDEX idx_smp_banner ON server_member_profiles (banner_url) WHERE banner_url IS NOT NULL;
CREATE INDEX idx_smp_nameplate ON server_member_profiles (nameplate_url) WHERE nameplate_url IS NOT NULL;
CREATE INDEX idx_smp_decoration ON server_member_profiles (avatar_decoration_url) WHERE avatar_decoration_url IS NOT NULL;

-- Caixa de saída dos arquivos: a linha pode sumir por vários caminhos (sair,
-- expulsar, banir, apagar conta ou servidor, todos por cascata). O gatilho
-- guarda as URLs na mesma transação e o backend apaga os arquivos depois, se
-- ninguém mais usar.
CREATE TABLE server_member_profile_media_trash (
    url TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE FUNCTION server_member_profile_media_trash() RETURNS trigger AS $$
BEGIN
    INSERT INTO server_member_profile_media_trash (url)
    SELECT u FROM unnest(ARRAY[OLD.avatar_url, OLD.banner_url, OLD.nameplate_url, OLD.avatar_decoration_url]) AS u
    WHERE u IS NOT NULL
    ON CONFLICT (url) DO NOTHING;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER server_member_profiles_media_trash
AFTER DELETE ON server_member_profiles
FOR EACH ROW EXECUTE FUNCTION server_member_profile_media_trash();

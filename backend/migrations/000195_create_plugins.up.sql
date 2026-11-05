-- Plugins da comunidade (docs/adr/0049): fichas de painéis de terceiros, aprovadas
-- pelo time; instalação por servidor e escolha de cada membro.
CREATE TABLE plugins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    panel_url TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'quebra-cabeca' CHECK (icon IN ('quebra-cabeca', 'bola')),
    author_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    review_note TEXT,
    reviewed_by UUID REFERENCES users (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE server_plugins (
    server_id UUID NOT NULL REFERENCES servers (id) ON DELETE CASCADE,
    plugin_id UUID NOT NULL REFERENCES plugins (id) ON DELETE CASCADE,
    installed_by UUID REFERENCES users (id) ON DELETE SET NULL,
    installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (server_id, plugin_id)
);

-- Escolha de cada membro. Sair do servidor ou desinstalar o plugin limpa pelo banco.
CREATE TABLE member_plugins (
    server_id UUID NOT NULL,
    user_id UUID NOT NULL,
    plugin_id UUID NOT NULL,
    PRIMARY KEY (server_id, user_id, plugin_id),
    FOREIGN KEY (server_id, user_id) REFERENCES server_members (server_id, user_id) ON DELETE CASCADE,
    FOREIGN KEY (server_id, plugin_id) REFERENCES server_plugins (server_id, plugin_id) ON DELETE CASCADE
);

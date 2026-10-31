-- Eventos do servidor (docs/superpowers/specs/2026-10-30-eventos-do-servidor-design.md).
-- A recorrência guarda só a regra: next_start_at é a ocorrência atual e
-- occurrences_done o índice dela (OccurrenceAt em internal/event/recurrence.go).
CREATE TABLE server_events (
    id UUID PRIMARY KEY,
    server_id UUID NOT NULL REFERENCES servers (id) ON DELETE CASCADE,
    scope VARCHAR(16) NOT NULL DEFAULT 'server' CHECK (scope IN ('server')),
    title VARCHAR(100) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    banner_id UUID,
    starts_at TIMESTAMPTZ NOT NULL,
    next_start_at TIMESTAMPTZ NOT NULL,
    -- A ocorrência dura duration_minutes a partir de next_start_at; no fim, a sala fecha.
    duration_minutes INT NOT NULL DEFAULT 120 CHECK (duration_minutes BETWEEN 15 AND 720),
    -- A sala da ocorrência em andamento (voz e texto, criados na hora do início e
    -- apagados no fim). Apagar o canal à mão zera a coluna (SET NULL).
    voice_channel_id UUID REFERENCES channels (id) ON DELETE SET NULL,
    text_channel_id UUID REFERENCES channels (id) ON DELETE SET NULL,
    recurrence VARCHAR(8) NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'daily', 'weekly', 'monthly')),
    recurrence_until TIMESTAMPTZ,
    recurrence_count INT CHECK (recurrence_count IS NULL OR recurrence_count >= 1),
    occurrences_done INT NOT NULL DEFAULT 0,
    reminder_offsets INT[] NOT NULL DEFAULT '{10,5}',
    created_by UUID REFERENCES users (id) ON DELETE SET NULL,
    canceled_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lista do servidor (só os vivos) e varredura do ticker.
CREATE INDEX idx_server_events_server ON server_events (server_id, next_start_at)
    WHERE canceled_at IS NULL AND finished_at IS NULL;
CREATE INDEX idx_server_events_active ON server_events (next_start_at)
    WHERE canceled_at IS NULL AND finished_at IS NULL;

-- Quem tem sala aberta (para o agendador fechar as que acabaram).
CREATE INDEX idx_server_events_rooms ON server_events (next_start_at)
    WHERE voice_channel_id IS NOT NULL OR text_channel_id IS NOT NULL;

-- O banner é servido pelo id do arquivo; este índice acha o evento dono dele.
CREATE INDEX idx_server_events_banner ON server_events (banner_id) WHERE banner_id IS NOT NULL;

-- Configuração do servidor, definida pelo dono: o que cada cargo pode fazer com os
-- eventos (todos os eventos do servidor). actions é uma máscara: 1 criar, 2 editar,
-- 4 excluir, 8 configurar (abrir esta configuração e escolher criar, editar e excluir
-- dos cargos; só o dono liga ou desliga o 8). O dono sempre pode tudo; sem linha, o
-- cargo não pode nada.
CREATE TABLE event_role_actions (
    role_id UUID PRIMARY KEY REFERENCES roles (id) ON DELETE CASCADE,
    server_id UUID NOT NULL REFERENCES servers (id) ON DELETE CASCADE,
    actions SMALLINT NOT NULL CHECK (actions BETWEEN 1 AND 15)
);

CREATE INDEX idx_event_role_actions_server ON event_role_actions (server_id);

-- Presença da ocorrência atual; as antigas ficam para trás (a chave inclui a ocorrência).
CREATE TABLE event_rsvps (
    event_id UUID NOT NULL REFERENCES server_events (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    occurrence_start TIMESTAMPTZ NOT NULL,
    going BOOLEAN NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (event_id, user_id, occurrence_start)
);

-- Fila do ticker: um aviso por (evento, ocorrência, antecedência).
-- offset_minutes = 0 é o "começou".
CREATE TABLE event_reminders (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL REFERENCES server_events (id) ON DELETE CASCADE,
    occurrence_start TIMESTAMPTZ NOT NULL,
    offset_minutes INT NOT NULL CHECK (offset_minutes >= 0),
    due_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    UNIQUE (event_id, occurrence_start, offset_minutes)
);

CREATE INDEX idx_event_reminders_due ON event_reminders (due_at) WHERE sent_at IS NULL;

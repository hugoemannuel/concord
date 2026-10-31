-- Canal gerido: criado e apagado só por outra funcionalidade (hoje, a sala de um
-- evento: docs/EVENTOS.md). Quem gerencia canais não o renomeia, não o apaga, não
-- mexe nas permissões dele e não o escolhe como canal principal.
ALTER TABLE channels ADD COLUMN managed BOOLEAN NOT NULL DEFAULT FALSE;

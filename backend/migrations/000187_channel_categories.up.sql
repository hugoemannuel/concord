CREATE TABLE channel_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    UNIQUE (server_id, id)
);

CREATE INDEX channel_categories_server_order ON channel_categories(server_id, position, id);

CREATE TABLE channel_category_layout (
    channel_id UUID PRIMARY KEY REFERENCES channels(id) ON DELETE CASCADE,
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    category_id UUID,
    position INTEGER NOT NULL,
    FOREIGN KEY (server_id, category_id) REFERENCES channel_categories(server_id, id)
        ON DELETE SET NULL (category_id)
);

CREATE INDEX channel_category_layout_order ON channel_category_layout(server_id, category_id, position);

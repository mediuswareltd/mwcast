-- Create streams table
CREATE TABLE streams (
    id UUID PRIMARY KEY,
    host_id UUID REFERENCES users(id) ON DELETE SET NULL,
    host_name VARCHAR(255) NOT NULL,       -- Denormalized display name at creation time
    title VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'live',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_streams_host_id ON streams(host_id);
CREATE INDEX idx_streams_host_name ON streams(host_name);
CREATE INDEX idx_streams_status ON streams(status);
CREATE INDEX idx_streams_created_at ON streams(created_at DESC);

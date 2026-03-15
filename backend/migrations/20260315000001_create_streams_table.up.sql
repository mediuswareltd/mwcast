-- Create streams table
CREATE TABLE IF NOT EXISTS streams (
    id UUID PRIMARY KEY,
    host_id VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'live',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_streams_host_id ON streams(host_id);
CREATE INDEX IF NOT EXISTS idx_streams_status ON streams(status);
CREATE INDEX IF NOT EXISTS idx_streams_created_at ON streams(created_at DESC);

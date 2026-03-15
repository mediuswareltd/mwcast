-- Drop indexes
DROP INDEX IF EXISTS idx_streams_created_at;
DROP INDEX IF EXISTS idx_streams_status;
DROP INDEX IF EXISTS idx_streams_host_id;

-- Drop streams table
DROP TABLE IF EXISTS streams;

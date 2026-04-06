ALTER TABLE streams RENAME COLUMN host_name TO host_id;
ALTER INDEX idx_streams_host_name RENAME TO idx_streams_host_id;

ALTER TABLE streams RENAME COLUMN host_id TO host_name;
ALTER INDEX idx_streams_host_id RENAME TO idx_streams_host_name;

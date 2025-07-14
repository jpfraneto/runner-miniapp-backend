-- scripts/init-db.sql
-- Database initialization script for RUNNER API

-- Create database if not exists (handled by Docker environment)
-- Ensure proper encoding and collation
ALTER DATABASE runner_db SET timezone TO 'UTC';

-- Create extensions if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Create indexes for performance optimization
-- Note: These will be created automatically by TypeORM, but we can add custom ones here

-- Performance monitoring
CREATE OR REPLACE FUNCTION log_slow_queries() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE LOG 'Slow query detected: % ms', NEW.total_time;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a function to clean up old logs (optional)
CREATE OR REPLACE FUNCTION cleanup_old_data() RETURNS void AS $$
BEGIN
    -- Clean up old logs older than 30 days (if you implement logging tables)
    -- DELETE FROM logs WHERE created_at < NOW() - INTERVAL '30 days';
    
    -- Clean up old sessions that are very old and not needed
    -- This is just an example - adjust based on your needs
    RAISE LOG 'Database cleanup completed';
END;
$$ LANGUAGE plpgsql;

-- Create scheduled cleanup (requires pg_cron extension - optional)
-- SELECT cron.schedule('cleanup-job', '0 2 * * *', 'SELECT cleanup_old_data();');

-- Set up proper permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO runner_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO runner_user;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO runner_user;

-- Alter default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO runner_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO runner_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO runner_user;
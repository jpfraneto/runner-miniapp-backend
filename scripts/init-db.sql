-- scripts/init-db.sql
-- MySQL Database initialization script for RUNNER API

-- Set proper charset and collation
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET time_zone = '+00:00';
SET sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO';

-- Create database if not exists (handled by Docker environment)
-- Ensure proper charset
ALTER DATABASE runner_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Performance optimization settings
SET GLOBAL innodb_buffer_pool_size = 256*1024*1024; -- 256MB
SET GLOBAL max_connections = 200;
SET GLOBAL innodb_log_file_size = 64*1024*1024; -- 64MB

-- Create a function to clean up old logs (if you implement logging tables)
DELIMITER $
CREATE PROCEDURE cleanup_old_data()
BEGIN
    -- Clean up old logs older than 30 days (if you implement logging tables)
    -- DELETE FROM logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY);
    
    -- Clean up old sessions that are very old and not needed
    -- This is just an example - adjust based on your needs
    SELECT 'Database cleanup completed' as message;
END$
DELIMITER ;

-- Create scheduled cleanup event (runs daily at 2 AM)
CREATE EVENT IF NOT EXISTS daily_cleanup
ON SCHEDULE EVERY 1 DAY
STARTS TIMESTAMP(CURDATE() + INTERVAL 1 DAY, '02:00:00')
DO
  CALL cleanup_old_data();

-- Set up proper permissions for the runner_user
GRANT ALL PRIVILEGES ON runner_db.* TO 'runner_user'@'%';
FLUSH PRIVILEGES;

-- Create indexes for better performance (these will complement TypeORM's indexes)
-- Note: TypeORM will create the actual tables, these are additional optimizations

-- Performance monitoring query (you can run this later to check performance)
-- SELECT 
--   TABLE_NAME,
--   TABLE_ROWS,
--   DATA_LENGTH/1024/1024 as 'Data Size (MB)',
--   INDEX_LENGTH/1024/1024 as 'Index Size (MB)'
-- FROM information_schema.TABLES 
-- WHERE TABLE_SCHEMA = 'runner_db'
-- ORDER BY DATA_LENGTH DESC;
# Database configuration
DATABASE_HOST=127.0.0.1
DATABASE_USER=root
DATABASE_PORT=3307  
DATABASE_PASSWORD=1234
DATABASE_NAME=runnercoin_db
DATABASE_SSL=false

# Database connection options (uncomment the one that works for you)
# Option 1: Direct mysql command
MYSQL_CMD=mysql -h$(DATABASE_HOST) -P$(DATABASE_PORT) -u$(DATABASE_USER) -p$(DATABASE_PASSWORD)

# Option 2: Docker container (if running MySQL in Docker)
# MYSQL_CMD=docker exec -i runnercoin_db mysql -u$(DATABASE_USER) -p$(DATABASE_PASSWORD)

# Option 3: Using docker-compose
MYSQL_CMD=docker-compose exec db mysql -u$(DATABASE_USER) -p$(DATABASE_PASSWORD)

# Option 4: Using mycli (if installed)
# MYSQL_CMD=mycli -h $(DB_HOST) -P $(DB_PORT) -u $(DB_USER) -p $(DB_PASSWORD) --execute

# Check MySQL connection method
check-mysql:
	@echo "Checking available MySQL connection methods..."
	@if command -v mysql >/dev/null 2>&1; then \
		echo "✓ mysql command available"; \
	else \
		echo "✗ mysql command not found"; \
	fi
	@if command -v docker >/dev/null 2>&1; then \
		echo "✓ docker available"; \
		if docker ps --format "table {{.Names}}" | grep -q mysql; then \
			echo "✓ MySQL container found"; \
		else \
			echo "✗ No MySQL container running"; \
		fi \
	else \
		echo "✗ docker not found"; \
	fi
	@if command -v docker-compose >/dev/null 2>&1; then \
		echo "✓ docker-compose available"; \
	else \
		echo "✗ docker-compose not found"; \
	fi

.PHONY: db-reset db-drop db-create db-status help check-mysql

# Reset database (drop and recreate)
db-reset: db-drop db-create db-sync db-seed
	@echo "Database '$(DATABASE_NAME)' has been reset and seeded successfully!"

# Drop the database
db-drop:
	@echo "Dropping database '$(DATABASE_NAME)'..."
	@$(MYSQL_CMD) -e "DROP DATABASE IF EXISTS $(DATABASE_NAME);"
	@echo "Database dropped."

# Create the database
db-create:
	@echo "Creating database '$(DATABASE_NAME)'..."
	@$(MYSQL_CMD) -e "CREATE DATABASE $(DATABASE_NAME);"
	@echo "Database created."

# Check database status
db-status:
	@echo "Checking database status..."
	@$(MYSQL_CMD) -e "SHOW DATABASES LIKE '$(DATABASE_NAME)';"

# Sync database schema (create tables)
db-sync:
	@echo "Syncing database schema..."
	@npx ts-node src/scripts/sync-database.ts

# Seed the database with workout data
db-seed:
	@echo "Seeding database with workout data..."
	@npx ts-node src/core/training/services/seed-database.ts

# Show available commands
help:
	@echo "Available commands:"
	@echo "  make db-reset   - Drop, recreate and seed the database"
	@echo "  make db-drop    - Drop the database"
	@echo "  make db-create  - Create the database"
	@echo "  make db-seed    - Seed the database with workout data"
	@echo "  make db-status  - Check if database exists"
	@echo "  make help        - Show this help message"

# Default target
all: help
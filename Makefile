# Database configuration
DB_HOST=127.0.0.1
DB_USER=root
DB_PORT=3307
DB_PASSWORD=1234
DB_NAME=runnercoin_db
DB_SSL=false

# Database connection options (uncomment the one that works for you)
# Option 1: Direct mysql command
# MYSQL_CMD=mysql -h$(DB_HOST) -P$(DB_PORT) -u$(DB_USER) -p$(DB_PASSWORD)

# Option 2: Docker container (if running MySQL in Docker)
MYSQL_CMD=docker exec -i runnercoin-mysql mysql -u$(DB_USER) -p$(DB_PASSWORD)

# Option 3: Using docker-compose
# MYSQL_CMD=docker-compose exec mysql mysql -h$(DB_HOST) -P$(DB_PORT) -u$(DB_USER) -p$(DB_PASSWORD)

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
db-reset: db-drop db-create db-seed
	@echo "Database '$(DB_NAME)' has been reset and seeded successfully!"

# Drop the database
db-drop:
	@echo "Dropping database '$(DB_NAME)'..."
	@$(MYSQL_CMD) -e "DROP DATABASE IF EXISTS $(DB_NAME);"
	@echo "Database dropped."

# Create the database
db-create:
	@echo "Creating database '$(DB_NAME)'..."
	@$(MYSQL_CMD) -e "CREATE DATABASE $(DB_NAME);"
	@echo "Database created."

# Check database status
db-status:
	@echo "Checking database status..."
	@$(MYSQL_CMD) -e "SHOW DATABASES LIKE '$(DB_NAME)';"

# Seed the database with workout data
db-seed:
	@echo "Seeding database with workout data..."
	@npx ts-node src/scripts/seed-database.ts

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
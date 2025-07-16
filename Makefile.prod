# Clean Makefile for RUNNER API
# Works with your current setup: Local MySQL + PM2 + Nginx

# Variables
DATABASE_NAME := runnercoin_db
DATABASE_USER := runner
DATABASE_PASSWORD := RunnerDB2024!
MYSQL_ROOT_PASSWORD := 1234

# MySQL connection command (your actual setup)
MYSQL_CMD := mysql -u root -p$(MYSQL_ROOT_PASSWORD)

.PHONY: help dev-setup db-reset db-drop db-create db-status db-seed build start restart logs stop status deploy update

# Show available commands
help:
	@echo "🏃 RUNNER API - Available Commands:"
	@echo ""
	@echo "📦 Development:"
	@echo "  make dev-setup    - Install dependencies and build"
	@echo "  make build        - Build the application"
	@echo "  make start        - Start with PM2"
	@echo "  make restart      - Restart PM2 process"
	@echo "  make stop         - Stop PM2 process"
	@echo "  make logs         - View PM2 logs"
	@echo "  make status       - Check PM2 status"
	@echo ""
	@echo "🗄️  Database:"
	@echo "  make db-status    - Check database connection"
	@echo "  make db-create    - Create database and user"
	@echo "  make db-drop      - Drop database (careful!)"
	@echo "  make db-reset     - Drop, recreate, sync and seed database"
	@echo "  make dev-db-reset - Quick reset for development (no confirmation)"
	@echo "  make db-sync      - Sync database schema from entities"
	@echo "  make db-seed      - Seed database with sample data"
	@echo ""
	@echo "🚀 Deployment:"
	@echo "  make deploy       - Full deployment (build + restart)"
	@echo "  make update       - Quick update (git pull + restart)"

# Development setup
dev-setup:
	@echo "📦 Setting up development environment..."
	bun install
	@echo "✅ Dependencies installed"

# Build application
build:
	@echo "🔨 Building application..."
	bun run build
	@echo "✅ Build complete"

# Start with PM2
start: build
	@echo "🚀 Starting RUNNER API with PM2..."
	pm2 start ecosystem.config.js --env production
	@echo "✅ Application started"

# Restart PM2 process
restart:
	@echo "🔄 Restarting RUNNER API..."
	pm2 restart runner-api
	@echo "✅ Application restarted"

# Stop PM2 process
stop:
	@echo "⏹️  Stopping RUNNER API..."
	pm2 stop runner-api
	@echo "✅ Application stopped"

# View logs
logs:
	@echo "📝 Showing application logs..."
	pm2 logs runner-api --lines 50

# Check status
status:
	@echo "📊 Checking application status..."
	pm2 status
	@echo ""
	@echo "🌐 Testing API health..."
	@curl -s http://localhost:3000/health || echo "❌ API not responding"

# Check database connection
db-status:
	@echo "📊 Checking database connection..."
	@$(MYSQL_CMD) -e "SELECT 'Database connection successful' as status;" 2>/dev/null || echo "❌ Database connection failed"
	@$(MYSQL_CMD) -e "SHOW DATABASES LIKE '$(DATABASE_NAME)';" 2>/dev/null || echo "❌ Database '$(DATABASE_NAME)' not found"

# Create database and user
db-create:
	@echo "🗄️  Creating database and user..."
	@$(MYSQL_CMD) -e "CREATE DATABASE IF NOT EXISTS $(DATABASE_NAME);" || echo "❌ Failed to create database"
	@$(MYSQL_CMD) -e "CREATE USER IF NOT EXISTS '$(DATABASE_USER)'@'localhost' IDENTIFIED BY '$(DATABASE_PASSWORD)';" || echo "ℹ️  User might already exist"
	@$(MYSQL_CMD) -e "GRANT ALL PRIVILEGES ON $(DATABASE_NAME).* TO '$(DATABASE_USER)'@'localhost';" || echo "❌ Failed to grant privileges"
	@$(MYSQL_CMD) -e "FLUSH PRIVILEGES;" || echo "❌ Failed to flush privileges"
	@echo "✅ Database and user created"

# Drop database (dangerous!)
db-drop:
	@echo "⚠️  WARNING: This will delete ALL data in $(DATABASE_NAME)!"
	@read -p "Are you sure? Type 'yes' to continue: " confirm && [ "$confirm" = "yes" ] || exit 1
	@echo "🗑️  Dropping database..."
	@$(MYSQL_CMD) -e "DROP DATABASE IF EXISTS $(DATABASE_NAME);" || echo "❌ Failed to drop database"
	@echo "✅ Database dropped"

# Force drop database (no confirmation - for development)
db-drop-force:
	@echo "🗑️  Force dropping database..."
	@$(MYSQL_CMD) -e "DROP DATABASE IF EXISTS $(DATABASE_NAME);" || echo "❌ Failed to drop database"
	@echo "✅ Database dropped"

# Sync database schema (create tables from entities)
db-sync:
	@echo "🔄 Syncing database schema..."
	@if [ -f "src/scripts/sync-database.ts" ]; then \
		npx ts-node src/scripts/sync-database.ts; \
	else \
		echo "❌ sync-database.ts not found at src/scripts/"; \
		echo "Tables will be created automatically when app starts with synchronize: true"; \
	fi

# Reset database (drop, recreate, sync, and seed)
db-reset: db-drop db-create db-sync db-seed
	@echo "✅ Database reset complete with seeded data!"

# Quick reset without confirmation (for development)
dev-db-reset: db-drop-force db-create db-sync db-seed
	@echo "✅ Development database reset complete!"

# Seed database with workout data
db-seed:
	@echo "🌱 Seeding database with workout data..."
	@if [ -f "src/core/training/services/seed-database.ts" ]; then \
		npx ts-node src/core/training/services/seed-database.ts; \
	elif [ -f "src/scripts/seed-database.ts" ]; then \
		npx ts-node src/scripts/seed-database.ts; \
	elif [ -f "scripts/seed-database.js" ]; then \
		node scripts/seed-database.js; \
	else \
		echo "❌ No seed script found"; \
		echo "Expected locations:"; \
		echo "  - src/core/training/services/seed-database.ts"; \
		echo "  - src/scripts/seed-database.ts"; \
		echo "  - scripts/seed-database.js"; \
	fi

# Full deployment
deploy: build restart
	@echo "🚀 Deployment complete!"
	@echo "📍 API should be available at: https://api.runnercoin.lat"
	@$(MAKE) status

# Quick update (git pull + restart)
update:
	@echo "📥 Pulling latest changes..."
	git pull origin main
	@$(MAKE) deploy

# Default target
all: help
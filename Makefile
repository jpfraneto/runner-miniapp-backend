# Production Deployment Makefile for RUNNER API
# Run with: make deploy-production

# Variables
SERVER_USER := root
SERVER_HOST := 143.198.167.142
DOMAIN := api.runnercoin.lat
DB_NAME := runner_db
DB_USER := runner_user
DB_PASSWORD := $(shell openssl rand -base64 32)
JWT_SECRET := $(shell openssl rand -base64 64)

.PHONY: setup-production deploy-production local-setup docker-setup db-reset db-drop db-create db-status help check-mysql check-server-host restart status logs continue-deployment

# Check if SERVER_HOST is set
check-server-host:
ifeq ($(SERVER_HOST),YOUR_SERVER_IP_HERE)
	@echo "❌ Please update SERVER_HOST in the Makefile with your actual server IP"
	@echo "   Edit the Makefile and change 'YOUR_SERVER_IP_HERE' to your server's IP address"
	@exit 1
endif

# One-command production setup
deploy-production: check-server-host docker-setup server-setup deploy-app setup-ssl setup-auto-deploy
	@echo "🚀 Production deployment complete!"
	@echo "📍 Your API is available at: https://$(DOMAIN)"
	@echo "🔐 Database password saved in .env.production"

# Initial server setup
server-setup:
	@echo "🔧 Setting up production server..."
	scp scripts/server-setup.sh $(SERVER_USER)@$(SERVER_HOST):/tmp/
	ssh $(SERVER_USER)@$(SERVER_HOST) "chmod +x /tmp/server-setup.sh && /tmp/server-setup.sh"

# Deploy application (Git-based deployment)
deploy-app:
	@echo "📦 Deploying application from GitHub..."
	scp .env.production $(SERVER_USER)@$(SERVER_HOST):/opt/runner-api/
	scp scripts/deploy.sh $(SERVER_USER)@$(SERVER_HOST):/opt/runner-api/
	ssh $(SERVER_USER)@$(SERVER_HOST) "cd /opt/runner-api && chmod +x deploy.sh && ./deploy.sh"

# Setup SSL with Let's Encrypt
setup-ssl:
	@echo "🔒 Setting up SSL certificate..."
	scp scripts/ssl-setup.sh $(SERVER_USER)@$(SERVER_HOST):/tmp/
	ssh $(SERVER_USER)@$(SERVER_HOST) "chmod +x /tmp/ssl-setup.sh && /tmp/ssl-setup.sh $(DOMAIN)"

# Setup auto-deployment
setup-auto-deploy:
	@echo "🔄 Setting up auto-deployment..."
	scp scripts/webhook-server.js $(SERVER_USER)@$(SERVER_HOST):/opt/runner-api/
	scp scripts/webhook.service $(SERVER_USER)@$(SERVER_HOST):/etc/systemd/system/
	ssh $(SERVER_USER)@$(SERVER_HOST) "systemctl enable webhook && systemctl start webhook"

# Create local Docker setup
docker-setup:
	@echo "🐳 Creating Docker configuration..."
	@echo "Creating .env.production file..."
	@echo "NODE_ENV=production" > .env.production
	@echo "PORT=3000" >> .env.production
	@echo "DB_HOST=postgres" >> .env.production
	@echo "DB_PORT=5432" >> .env.production
	@echo "DB_USERNAME=$(DB_USER)" >> .env.production
	@echo "DB_PASSWORD='$(DB_PASSWORD)'" >> .env.production
	@echo "DB_NAME=$(DB_NAME)" >> .env.production
	@echo "DB_REQUIRE_SSL=false" >> .env.production
	@echo "JWT_SECRET='$(JWT_SECRET)'" >> .env.production
	@echo "OPENAI_API_KEY=your_openai_key_here" >> .env.production
	@echo "DIGITAL_OCEAN_SPACES_KEY=your_do_spaces_key_here" >> .env.production
	@echo "DIGITAL_OCEAN_SPACES_SECRET=your_do_spaces_secret_here" >> .env.production
	@echo "DIGITAL_OCEAN_SPACES_ENDPOINT=your_do_spaces_endpoint_here" >> .env.production
	@echo "DIGITAL_OCEAN_SPACES_BUCKET=your_do_spaces_bucket_here" >> .env.production
	@echo "NEYNAR_API_KEY=your_neynar_api_key_here" >> .env.production

# Local development setup  
local-setup:
	@echo "💻 Setting up local development..."
	docker-compose up -d postgres
	npm install
	npm run build

# Emergency restart
restart:
	@echo "🧹 Cleaning up..."
	ssh $(SERVER_USER)@$(SERVER_HOST) "cd /opt/runner-api && docker-compose down && docker system prune -f"

# Check deployment status
status:
	@echo "📊 Checking deployment status..."
	ssh $(SERVER_USER)@$(SERVER_HOST) "cd /opt/runner-api && docker-compose ps && systemctl status nginx"

# View logs
logs:
	@echo "📝 Showing application logs..."
	ssh $(SERVER_USER)@$(SERVER_HOST) "cd /opt/runner-api && docker-compose logs -f --tail=100 api"

# Continue deployment (if server setup already completed)
continue-deployment: check-server-host deploy-app setup-ssl setup-auto-deploy
	@echo "🚀 Continuing deployment from where it left off..."
	@echo "📍 Your API should be available at: https://$(DOMAIN)"
	@echo "🔄 Restarting services..."
	ssh $(SERVER_USER)@$(SERVER_HOST) "cd /opt/runner-api && docker-compose restart"

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
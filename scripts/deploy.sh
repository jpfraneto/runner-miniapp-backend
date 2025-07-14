#!/bin/bash
# scripts/deploy.sh
set -e

echo "🚀 Deploying RUNNER API..."

# Check if we're in the right directory
if [ ! -d "/opt/runner-api" ]; then
    echo "❌ Error: /opt/runner-api directory not found"
    exit 1
fi

cd /opt/runner-api

# Initialize git repository if it doesn't exist
if [ ! -d ".git" ]; then
    echo "📦 Initializing git repository..."
    git init
    git remote add origin https://github.com/jpfraneto/runner-miniapp-backend.git
fi

# Ensure we have the correct remote
git remote set-url origin https://github.com/jpfraneto/runner-miniapp-backend.git

# Fetch and checkout the latest main branch
echo "📥 Fetching latest changes from main branch..."
git fetch origin main

# Force checkout to handle any conflicting files
echo "🔄 Checking out latest main branch (force)..."
git reset --hard HEAD
git clean -fd  # Remove untracked files
git checkout -B main origin/main

# Ensure we have all required files
echo "🔍 Checking required files..."
required_files=("package.json" "src" "Dockerfile.prod" "docker-compose.prod.yml")
for file in "${required_files[@]}"; do
    if [ ! -e "$file" ]; then
        echo "❌ Error: Required file/directory '$file' not found in repository"
        exit 1
    fi
done
echo "✅ All required files found"

# Load environment variables from the uploaded .env.production
if [ -f ".env.production" ]; then
    echo "📄 Loading environment variables..."
    set -a
    source .env.production
    # Map variables for Docker Compose compatibility
    export DB_USER="$DB_USERNAME"
    set +a
    echo "✅ Environment variables loaded"
else
    echo "❌ Error: .env.production file not found"
    exit 1
fi

# Stop existing containers gracefully
echo "🛑 Stopping existing containers..."
if docker-compose -f docker-compose.prod.yml ps -q 2>/dev/null | grep -q .; then
    echo "   Found running containers, stopping gracefully..."
    docker-compose -f docker-compose.prod.yml stop
else
    echo "   No running containers found"
fi

# Remove old containers
echo "🧹 Cleaning up old containers..."
docker-compose -f docker-compose.prod.yml down --remove-orphans 2>/dev/null || true

# Build new images
echo "🔨 Building Docker images..."
docker-compose -f docker-compose.prod.yml build --no-cache api

# Start services
echo "▶️ Starting services..."
docker-compose -f docker-compose.prod.yml up -d

# Function to check if a container is healthy
check_health() {
    local container_name=$1
    local max_attempts=60  # 5 minutes max
    local attempt=0
    
    echo "   Checking $container_name health..."
    while [ $attempt -lt $max_attempts ]; do
        # Check if container is running and healthy
        if docker-compose -f docker-compose.prod.yml ps | grep -q "$container_name.*Up.*healthy"; then
            return 0
        elif docker-compose -f docker-compose.prod.yml ps | grep -q "$container_name.*Up"; then
            echo "   $container_name is up but not healthy yet (attempt $((attempt + 1))/$max_attempts)..."
        else
            echo "   $container_name is not running yet (attempt $((attempt + 1))/$max_attempts)..."
        fi
        
        sleep 5
        attempt=$((attempt + 1))
    done
    
    return 1
}

# Wait for services to be healthy
echo "🏥 Waiting for services to be healthy..."

# Check MySQL health first
if ! check_health "runner_mysql"; then
    echo "❌ MySQL database failed to become healthy"
    echo "📋 MySQL logs:"
    docker-compose -f docker-compose.prod.yml logs mysql | tail -50
    exit 1
fi
echo "   ✅ MySQL is healthy"

# Check API health
if ! check_health "runner_api"; then
    echo "❌ API failed to become healthy"
    echo "📋 API logs:"
    docker-compose -f docker-compose.prod.yml logs api | tail -50
    exit 1
fi
echo "   ✅ API is healthy"

# Final status check
echo "📊 Final deployment status:"
docker-compose -f docker-compose.prod.yml ps

# Clean up old Docker images to save space
echo "🧹 Cleaning up unused Docker images..."
docker image prune -f

echo ""
echo "🎉 Deployment completed successfully!"
echo "📍 Services status:"
docker-compose -f docker-compose.prod.yml ps --format "table {{.Service}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "🔗 API Health Check:"
echo "   Try: curl http://localhost:3000/health"
echo ""
echo "🔗 Next steps:"
echo "   1. Set up SSL with: make setup-ssl"
echo "   2. Configure domain DNS to point to this server"
echo "   3. Set up auto-deployment webhooks"
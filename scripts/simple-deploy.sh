#!/bin/bash
# Simple deployment script for Digital Ocean droplet
# Usage: ./scripts/simple-deploy.sh
set -e

echo "🚀 Starting simple deployment for api.runnercoin.lat..."

# Check if we're on a fresh droplet
if [ ! -f "/root/.deploy_initialized" ]; then
    echo "🔧 First-time setup detected. Installing dependencies..."
    
    # Update system
    apt-get update && apt-get upgrade -y
    
    # Install Docker
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    
    # Install Docker Compose
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    
    # Install other essentials
    apt-get install -y git nginx certbot python3-certbot-nginx make
    
    # Create app directory
    mkdir -p /opt/runner-api
    cd /opt/runner-api
    
    # Clone repository
    git clone https://github.com/jpfraneto/runner-miniapp-backend.git .
    
    # Mark as initialized
    touch /root/.deploy_initialized
    
    echo "✅ System setup complete!"
else
    echo "📂 System already initialized. Updating code..."
    cd /opt/runner-api
    git pull origin main
fi

# Check if .env file exists
if [ ! -f "/opt/runner-api/.env" ]; then
    # Check if it was copied to /tmp
    if [ -f "/tmp/.env" ]; then
        echo "📄 Moving .env file to app directory..."
        mv /tmp/.env /opt/runner-api/.env
    else
        echo "❌ Error: .env file not found!"
        echo "Please copy your .env file to /opt/runner-api/.env"
        echo "Example: scp .env root@your-droplet:/opt/runner-api/.env"
        exit 1
    fi
fi

# Load environment variables
source /opt/runner-api/.env

echo "🐳 Starting Docker services..."

# Stop existing containers
docker-compose -f docker-compose.prod.yml down 2>/dev/null || true

# Build and start services
docker-compose -f docker-compose.prod.yml up -d --build

# Wait for MySQL to be ready
echo "⏳ Waiting for MySQL to be ready..."
sleep 30

# Check if MySQL is ready
until docker-compose -f docker-compose.prod.yml exec -T mysql mysql -u root -p"${MYSQL_ROOT_PASSWORD}" -e "SELECT 1" >/dev/null 2>&1; do
    echo "   MySQL is not ready yet. Waiting..."
    sleep 5
done

echo "✅ MySQL is ready!"

# Check if Node.js is available for running database commands
if command -v node >/dev/null 2>&1; then
    echo "🗄️ Running database setup..."
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo "📦 Installing Node.js dependencies..."
        npm install
    fi
    
    # Build the application
    echo "🔨 Building application..."
    npm run build
    
    # Run database reset if available
    if [ -f "src/scripts/sync-database.ts" ]; then
        echo "🗄️ Syncing database schema..."
        npx ts-node src/scripts/sync-database.ts
    fi
    
    if [ -f "src/core/training/services/seed-database.ts" ]; then
        echo "🌱 Seeding database..."
        npx ts-node src/core/training/services/seed-database.ts
    fi
else
    echo "⚠️  Node.js not found, skipping database setup"
    echo "   Database will be set up when the application starts"
fi

# Setup nginx if not already configured
if [ ! -f "/etc/nginx/sites-available/api.runnercoin.lat" ]; then
    echo "🌐 Setting up nginx..."
    
    # Create nginx site config
    cat > /etc/nginx/sites-available/api.runnercoin.lat << 'EOF'
server {
    listen 80;
    server_name api.runnercoin.lat;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }
}
EOF

    # Enable site
    ln -sf /etc/nginx/sites-available/api.runnercoin.lat /etc/nginx/sites-enabled/
    
    # Remove default site
    rm -f /etc/nginx/sites-enabled/default
    
    # Test nginx config
    nginx -t
    
    # Restart nginx
    systemctl restart nginx
    
    echo "✅ Nginx configured!"
fi

# Setup SSL if not already configured
if [ ! -f "/etc/letsencrypt/live/api.runnercoin.lat/fullchain.pem" ]; then
    echo "🔒 Setting up SSL certificate..."
    certbot --nginx -d api.runnercoin.lat --non-interactive --agree-tos --email admin@runnercoin.lat
    echo "✅ SSL certificate installed!"
fi

# Final status check
echo "📊 Deployment status:"
docker-compose -f docker-compose.prod.yml ps

echo ""
echo "🎉 Deployment complete!"
echo "📍 Your API is running at: https://api.runnercoin.lat"
echo "🔗 Health check: curl https://api.runnercoin.lat/health"
echo ""
echo "📝 Useful commands:"
echo "   - View logs: docker-compose -f docker-compose.prod.yml logs -f"
echo "   - Restart services: docker-compose -f docker-compose.prod.yml restart"
echo "   - Update code: git pull && docker-compose -f docker-compose.prod.yml up -d --build"
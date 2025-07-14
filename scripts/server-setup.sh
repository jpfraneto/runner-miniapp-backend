#!/bin/bash
# scripts/server-setup.sh
set -e

echo "🚀 Setting up production server for RUNNER API..."

# Update system
apt-get update && apt-get upgrade -y

# Install required packages
apt-get install -y \
    docker.io \
    docker-compose \
    nginx \
    certbot \
    python3-certbot-nginx \
    git \
    curl \
    wget \
    unzip \
    nodejs \
    npm \
    ufw

# Start and enable Docker
systemctl start docker
systemctl enable docker

# Add current user to docker group
usermod -aG docker $USER

# Install Docker Compose (latest version)
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Create application directory
mkdir -p /opt/runner-api
mkdir -p /opt/runner-api/logs
mkdir -p /opt/runner-api/nginx/sites-available
mkdir -p /opt/runner-api/nginx/sites-enabled
mkdir -p /opt/runner-api/scripts

# Set up firewall
ufw --force enable
ufw allow ssh
ufw allow 80
ufw allow 443
ufw allow 3001  # For webhook server

# Create nginx configuration
cat > /opt/runner-api/nginx/nginx.conf << 'EOF'
user www-data;
worker_processes auto;
pid /run/nginx.pid;

events {
    worker_connections 1024;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Logging
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;
    error_log /var/log/nginx/error.log warn;

    # Performance
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 20M;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Include site configurations
    include /opt/runner-api/nginx/sites-enabled/*;
}
EOF

# Create systemd service for nginx override
mkdir -p /etc/systemd/system/nginx.service.d
cat > /etc/systemd/system/nginx.service.d/override.conf << 'EOF'
[Service]
ExecStart=
ExecStart=/usr/sbin/nginx -g 'daemon off;' -c /opt/runner-api/nginx/nginx.conf
ExecReload=
ExecReload=/bin/kill -s HUP $MAINPID
KillMode=mixed
EOF
systemctl daemon-reload

# Clone repository (will be updated by webhook)
cd /opt/runner-api
git init
git remote add origin git@github.com:jpfraneto/runner-miniapp-backend.git || true

# Set permissions
chown -R $USER:$USER /opt/runner-api
chmod -R 755 /opt/runner-api

# Create deployment script template
cat > /opt/runner-api/deploy.sh << 'EOF'
#!/bin/bash
set -e

echo "🚀 Deploying RUNNER API..."

# Pull latest changes
git fetch origin main
git reset --hard origin/main

# Build and deploy
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
timeout 300 bash -c 'while [[ "$(docker-compose -f docker-compose.prod.yml ps -q | xargs docker inspect --format="{{.State.Health.Status}}" 2>/dev/null | grep -c healthy)" != "2" ]]; do sleep 5; done'

echo "✅ Deployment complete!"
EOF

chmod +x /opt/runner-api/deploy.sh

echo "✅ Server setup complete!"
echo "📝 Next steps:"
echo "   1. Update DNS to point api.runnercoin.lat to this server"
echo "   2. Add GitHub SSH key for repository access"
echo "   3. Run the SSL setup script"
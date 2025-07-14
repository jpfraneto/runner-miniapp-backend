#!/bin/bash
# scripts/ssl-setup.sh
set -e

DOMAIN=$1

if [ -z "$DOMAIN" ]; then
    echo "❌ Error: Domain name required"
    echo "Usage: $0 <domain>"
    exit 1
fi

echo "🔒 Setting up SSL for $DOMAIN..."

# Create nginx site configuration
cat > /opt/runner-api/nginx/sites-available/$DOMAIN << EOF
# HTTP configuration (temporary for Let's Encrypt)
server {
    listen 80;
    server_name $DOMAIN;
    
    # Let's Encrypt challenge
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    # Redirect all HTTP to HTTPS (will be enabled after SSL setup)
    location / {
        proxy_pass http://api:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF

# Enable site
ln -sf /opt/runner-api/nginx/sites-available/$DOMAIN /opt/runner-api/nginx/sites-enabled/$DOMAIN

# Remove default nginx config if exists
rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
nginx -t -c /opt/runner-api/nginx/nginx.conf

# Restart nginx
systemctl restart nginx

# Create certbot directory
mkdir -p /var/www/certbot

# Wait for DNS propagation
echo "⏳ Waiting for DNS propagation..."
while ! nslookup $DOMAIN | grep -q "Address"; do
    echo "Waiting for DNS to propagate for $DOMAIN..."
    sleep 10
done

echo "✅ DNS resolved for $DOMAIN"

# Obtain SSL certificate
echo "📜 Obtaining SSL certificate..."
certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email admin@$DOMAIN \
    --agree-tos \
    --no-eff-email \
    -d $DOMAIN

# Update nginx configuration with SSL
cat > /opt/runner-api/nginx/sites-available/$DOMAIN << EOF
# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name $DOMAIN;
    
    # Let's Encrypt challenge
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    # Redirect all other traffic to HTTPS
    location / {
        return 301 https://\$server_name\$request_uri;
    }
}

# HTTPS configuration
server {
    listen 443 ssl http2;
    server_name $DOMAIN;
    
    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    
    # Modern SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    # Gzip configuration
    gzip on;
    gzip_types application/json application/javascript text/css text/javascript text/plain text/xml;
    gzip_min_length 1000;
    
    # API proxy
    location / {
        proxy_pass http://api:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Buffer settings
        proxy_buffering on;
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
    }
    
    # Health check endpoint
    location /health {
        proxy_pass http://api:3000/health;
        access_log off;
    }
}
EOF

# Test and reload nginx
nginx -t -c /opt/runner-api/nginx/nginx.conf
systemctl reload nginx

# Set up automatic certificate renewal
(crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet --post-hook 'systemctl reload nginx'") | crontab -

echo "✅ SSL setup complete!"
echo "🔒 Your API is now available at: https://$DOMAIN"
echo "🔄 Certificate auto-renewal configured"
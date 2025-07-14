#!/bin/bash
# scripts/fix-nginx.sh - Run this on your server to fix the nginx configuration

echo "🔧 Fixing nginx configuration..."

# Create the missing directory
mkdir -p /etc/systemd/system/nginx.service.d

# Create the nginx override configuration
cat > /etc/systemd/system/nginx.service.d/override.conf << 'EOF'
[Service]
ExecStart=
ExecStart=/usr/sbin/nginx -g 'daemon off;' -c /opt/runner-api/nginx/nginx.conf
ExecReload=
ExecReload=/bin/kill -s HUP $MAINPID
KillMode=mixed
EOF

# Reload systemd and restart nginx
systemctl daemon-reload
systemctl stop nginx
systemctl start nginx

echo "✅ Nginx configuration fixed!"

# Check nginx status
systemctl status nginx --no-pager
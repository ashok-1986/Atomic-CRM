#!/bin/bash
# Hostinger VPS Security & Monitoring Setup Script (Phase 3)
# Target OS: Ubuntu 22.04 / 24.04
# MUST BE RUN AS ROOT

set -e

echo "Starting Security Hardening and Monitoring Setup for Twenty CRM..."

# 1. UFW Firewall Configuration
echo "Configuring UFW Firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP (for Certbot & Nginx)
ufw allow 443/tcp   # HTTPS (Nginx)
echo "y" | ufw enable
echo "UFW Firewall enabled and restricted to ports 22, 80, and 443."

# 2. Install Fail2Ban
echo "Installing Fail2Ban..."
apt-get update
apt-get install -y fail2ban
systemctl enable fail2ban
systemctl start fail2ban
echo "Fail2Ban installed and running (default sshd protection active)."

# 3. Install Netdata for Host Monitoring
echo "Installing Netdata for CPU/Disk monitoring..."
# Official one-liner installation from Netdata
wget -O /tmp/netdata-kickstart.sh https://get.netdata.cloud/kickstart.sh && sh /tmp/netdata-kickstart.sh --non-interactive
echo "Netdata installed. (Accessible locally on port 19999, protect access via SSH tunnel or reverse proxy)."

# 4. Schedule Automated DB Backup Cron Job
echo "Scheduling daily cron job for PostgreSQL backup..."
BACKUP_SCRIPT="/opt/twenty/scripts/backup_db.sh"
# Ensure script is executable
if [ -f "$BACKUP_SCRIPT" ]; then
    chmod +x "$BACKUP_SCRIPT"
    # Add to daily cron at 2 AM if not already present
    (crontab -l 2>/dev/null | grep -v "$BACKUP_SCRIPT"; echo "0 2 * * * $BACKUP_SCRIPT >> /var/log/twenty_backup.log 2>&1") | crontab -
    echo "Cron job scheduled."
else
    echo "Warning: backup_db.sh not found at $BACKUP_SCRIPT. Please schedule cron manually after uploading the script."
fi

echo "======================================================"
echo "Phase 3 Security & Monitoring Setup Complete!"
echo "Next Steps:"
echo "1. Verify UFW rules with: ufw status numbered"
echo "2. Install Docker and Docker Compose if not already installed."
echo "3. Run 'docker-compose up -d' in your /opt/twenty directory."
echo "4. Provision SSL via Certbot: certbot certonly --dns-cloudflare -d '*.crm.alchemetryx.com'"
echo "======================================================"

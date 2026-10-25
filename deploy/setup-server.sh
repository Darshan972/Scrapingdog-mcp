#!/usr/bin/env bash
#
# One-time bootstrap for a bare Ubuntu/Debian box that will serve
# mcp.scrapingdog.com. Safe to re-run: every step checks before acting.
#
#   git clone https://github.com/Darshan972/Scrapingdog-mcp.git ~/Scrapingdog-mcp
#   cd ~/Scrapingdog-mcp && bash deploy/setup-server.sh
#
# After this, GitHub Actions deploys every push to main; you never run it again.
set -euo pipefail

DOMAIN="${DOMAIN:-mcp.scrapingdog.com}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PORT="${APP_PORT:-8731}"

say() { printf '\n=== %s\n' "$1"; }

say "1/7  System packages"
sudo apt-get update -qq
# libatomic1: Node's official linux-x64 build links against libatomic.so.1, which
# minimal Ubuntu/Debian images do not ship. Without it `node -v` fails with
# "error while loading shared libraries" and every later step is a mystery.
sudo apt-get install -y -qq curl git nginx ufw libatomic1

say "2/7  Node (version from .nvmrc)"
export NVM_DIR="$HOME/.nvm"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
fi
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
cd "$APP_DIR"
nvm install
nvm use
echo "node $(node -v)"

say "3/7  pm2"
command -v pm2 >/dev/null 2>&1 || npm install -g pm2

say "4/7  Build the app"
npm ci
npm run build
npm run smoke   # stubs the API; no key needed, no credits spent

say "5/7  Start under pm2"
pm2 reload ecosystem.config.cjs --update-env 2>/dev/null || pm2 start ecosystem.config.cjs
pm2 save
# Re-start pm2 (and the app) automatically after a reboot.
sudo env PATH="$PATH:$(dirname "$(command -v node)")" \
  pm2 startup systemd -u "$USER" --hp "$HOME" >/dev/null
echo "waiting for the app..."
for _ in $(seq 1 10); do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/healthz" >/dev/null 2>&1; then break; fi
  sleep 2
done
curl -fsS "http://127.0.0.1:${APP_PORT}/healthz" && echo

say "6/7  Firewall"
# The app itself listens only on 127.0.0.1, so nginx is the sole route in; this
# is belt-and-braces in case that ever changes by accident.
sudo ufw allow OpenSSH >/dev/null
sudo ufw allow 'Nginx Full' >/dev/null
sudo ufw --force enable >/dev/null
sudo ufw status | head -5

say "7/7  nginx + TLS"
sudo cp "$APP_DIR/deploy/nginx/${DOMAIN}.conf" /etc/nginx/sites-available/
sudo ln -sf "/etc/nginx/sites-available/${DOMAIN}.conf" "/etc/nginx/sites-enabled/${DOMAIN}.conf"
sudo nginx -t
sudo systemctl reload nginx

# certbot can only issue once the domain resolves to THIS box, so check first
# instead of failing with a confusing ACME error.
resolved="$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)"
public="$(curl -fsS https://api.ipify.org || true)"
if [ -z "$resolved" ]; then
  echo "SKIPPING TLS: $DOMAIN does not resolve yet."
  echo "Add a DNS A record  $DOMAIN -> ${public:-this box IP}  then run:"
  echo "    sudo certbot --nginx -d $DOMAIN"
elif [ -n "$public" ] && [ "$resolved" != "$public" ]; then
  echo "SKIPPING TLS: $DOMAIN resolves to $resolved but this box is $public."
  echo "Fix the DNS record, then run:  sudo certbot --nginx -d $DOMAIN"
else
  sudo apt-get install -y -qq certbot python3-certbot-nginx
  sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
    -m "${CERTBOT_EMAIL:-info@scrapingdog.com}" --redirect
  sudo systemctl reload nginx
fi

say "Done"
echo "Local check:   curl -s http://127.0.0.1:${APP_PORT}/healthz"
echo "Public check:  curl -s https://${DOMAIN}/healthz"
echo
echo "Then add these GitHub repository secrets so pushes to main deploy here:"
echo "  MCP_SERVER_HOST      ${public:-<this box IP>}"
echo "  MCP_SERVER_USER      $USER"
echo "  MCP_SSH_PRIVATE_KEY  a private key whose public half is in ~/.ssh/authorized_keys"

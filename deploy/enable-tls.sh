#!/usr/bin/env bash
#
# Turns on HTTPS for mcp.scrapingdog.com once a Cloudflare Origin Certificate is
# on the box. Safe to re-run, and it refuses rather than breaking nginx if
# anything is missing or mismatched.
#
#   sudo mkdir -p /etc/ssl/cloudflare
#   sudo nano /etc/ssl/cloudflare/mcp.scrapingdog.com.pem   # paste the certificate
#   sudo nano /etc/ssl/cloudflare/mcp.scrapingdog.com.key   # paste the private key
#   bash deploy/enable-tls.sh
set -euo pipefail

DOMAIN="${DOMAIN:-mcp.scrapingdog.com}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT="/etc/ssl/cloudflare/${DOMAIN}.pem"
KEY="/etc/ssl/cloudflare/${DOMAIN}.key"

for f in "$CERT" "$KEY"; do
  if ! sudo test -s "$f"; then
    echo "ERROR: $f is missing or empty."
    echo "Create an Origin Certificate in Cloudflare (SSL/TLS -> Origin Server),"
    echo "scoped to ${DOMAIN} only, and save both files first."
    exit 1
  fi
done

# A cert and key that do not belong together produce an nginx error that reads
# like a file-permissions problem. Catch it here, where the message is clear.
cert_mod="$(sudo openssl x509 -noout -modulus -in "$CERT" | openssl md5)"
key_mod="$(sudo openssl rsa -noout -modulus -in "$KEY" | openssl md5)"
if [ "$cert_mod" != "$key_mod" ]; then
  echo "ERROR: the certificate and private key do not match."
  echo "They must come from the same 'Create Certificate' screen in Cloudflare."
  exit 1
fi

sudo chmod 600 "$KEY"
sudo chown root:root "$CERT" "$KEY"

sudo cp "$APP_DIR/deploy/nginx/${DOMAIN}-tls.conf" /etc/nginx/sites-available/
sudo ln -sf "/etc/nginx/sites-available/${DOMAIN}-tls.conf" "/etc/nginx/sites-enabled/${DOMAIN}-tls.conf"

if ! sudo nginx -t; then
  # Leave nginx exactly as it was rather than reloading a broken config.
  sudo rm -f "/etc/nginx/sites-enabled/${DOMAIN}-tls.conf"
  echo "ERROR: nginx rejected the TLS config; it has been disabled again."
  exit 1
fi
sudo systemctl reload nginx

# -k on purpose: Cloudflare Origin certificates are trusted by Cloudflare and by
# nothing else, so certificate verification failing here is expected.
code="$(curl -ks -o /dev/null -w '%{http_code}' --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/healthz" || true)"
if [ "$code" = "200" ]; then
  echo
  echo "HTTPS is live on this origin."
  echo "Cloudflare still talks to it over HTTP until the zone's SSL/TLS mode moves to"
  echo "Full (strict) - that setting is zone-wide, so only change it once every origin"
  echo "under scrapingdog.com serves a valid certificate."
else
  echo "WARNING: local HTTPS check returned $code (expected 200)."
fi

#!/usr/bin/env bash
#
# Closes ports 80 and 443 to everyone except Cloudflare, so the origin can only
# be reached through the proxy. Without this, anyone who learns the box's IP can
# bypass Cloudflare entirely - no rate limiting, no DDoS absorption - and talk
# straight to the app.
#
#   bash deploy/lock-to-cloudflare.sh --dry-run    # print the rules, change nothing
#   bash deploy/lock-to-cloudflare.sh              # apply them
#   bash deploy/lock-to-cloudflare.sh --install-cron   # also refresh weekly
#
# SSH is never touched: these rules cover 80/443 only, so GitHub Actions deploys
# (which come from GitHub's IPs, not Cloudflare's) keep working.
set -euo pipefail

DRY_RUN=false
INSTALL_CRON=false
for arg in "$@"; do
  case "$arg" in
    --dry-run)      DRY_RUN=true ;;
    --install-cron) INSTALL_CRON=true ;;
    *) echo "unknown option: $arg"; exit 2 ;;
  esac
done

V4_URL="https://www.cloudflare.com/ips-v4"
V6_URL="https://www.cloudflare.com/ips-v6"

echo "Fetching Cloudflare's published ranges..."
v4="$(curl -fsS --max-time 20 "$V4_URL" || true)"
v6="$(curl -fsS --max-time 20 "$V6_URL" || true)"

# A truncated or empty list is the dangerous case: applying it would leave the
# origin reachable by nobody at all. Refuse rather than half-apply.
v4_count="$(printf '%s\n' "$v4" | grep -cE '^[0-9]+\.' || true)"
v6_count="$(printf '%s\n' "$v6" | grep -cE '^[0-9a-fA-F]*:' || true)"
if [ "$v4_count" -lt 10 ]; then
  echo "ERROR: only $v4_count IPv4 ranges came back from $V4_URL (expected ~15)."
  echo "Refusing to apply a partial list - that would lock out Cloudflare too."
  exit 1
fi
echo "  $v4_count IPv4 ranges, $v6_count IPv6 ranges"

if [ "$DRY_RUN" = true ]; then
  echo
  echo "--- would REMOVE these catch-all rules (if present):"
  echo "    ufw delete allow 'Nginx Full' | 'Nginx HTTP' | 'Nginx HTTPS' | 80/tcp | 443/tcp"
  echo "--- would KEEP ssh open:"
  echo "    ufw allow OpenSSH"
  echo "--- would ADD, for each range:"
  printf '%s\n' "$v4" | grep -E '^[0-9]+\.' | sed 's/^/    ufw allow proto tcp from /;s/$/ to any port 80,443/'
  printf '%s\n' "$v6" | grep -E '^[0-9a-fA-F]*:' | sed 's/^/    ufw allow proto tcp from /;s/$/ to any port 80,443/'
  echo
  echo "Nothing was changed. Re-run without --dry-run to apply."
  exit 0
fi

# Order matters: make sure we can still get back in before narrowing anything.
echo "Ensuring SSH stays allowed..."
sudo ufw allow OpenSSH >/dev/null 2>&1 || sudo ufw allow 22/tcp >/dev/null

echo "Removing catch-all web rules..."
for rule in "'Nginx Full'" "'Nginx HTTP'" "'Nginx HTTPS'" "80/tcp" "443/tcp" "80" "443"; do
  eval "sudo ufw --force delete allow $rule" >/dev/null 2>&1 || true
done

echo "Allowing Cloudflare only..."
while read -r cidr; do
  [ -n "$cidr" ] || continue
  sudo ufw allow proto tcp from "$cidr" to any port 80,443 comment 'cloudflare' >/dev/null
done < <(printf '%s\n' "$v4" | grep -E '^[0-9]+\.')

while read -r cidr; do
  [ -n "$cidr" ] || continue
  sudo ufw allow proto tcp from "$cidr" to any port 80,443 comment 'cloudflare' >/dev/null 2>&1 || true
done < <(printf '%s\n' "$v6" | grep -E '^[0-9a-fA-F]*:')

sudo ufw --force enable >/dev/null
sudo ufw reload >/dev/null

echo
sudo ufw status | head -30

if [ "$INSTALL_CRON" = true ]; then
  # Cloudflare adds ranges occasionally. A stale allowlist is the usual way this
  # setup breaks months later, with traffic failing from one region only.
  script_path="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
  sudo tee /etc/cron.weekly/cloudflare-ufw >/dev/null <<EOF
#!/bin/sh
# Refresh the Cloudflare allowlist; installed by lock-to-cloudflare.sh
bash "$script_path" >/var/log/cloudflare-ufw.log 2>&1
EOF
  sudo chmod +x /etc/cron.weekly/cloudflare-ufw
  echo "Weekly refresh installed at /etc/cron.weekly/cloudflare-ufw"
fi

echo
echo "Done. Verify from your laptop (NOT from this box):"
echo "  through Cloudflare, should work:   curl -s https://mcp.scrapingdog.com/healthz"
echo "  direct to origin, should TIME OUT: curl -s -m 10 -H 'Host: mcp.scrapingdog.com' http://\$(curl -fsS https://api.ipify.org)/healthz"

#!/usr/bin/env bash
# set-domain.sh <new-domain> [--issue] — the one-liner domain swap.
# Rewrites server_name in the greenfield site config (old domain -> new, with
# its www. twin), optionally issues a Let's Encrypt cert (webroot; DNS must
# already point at this box), validates, reloads. Idempotent.
set -euo pipefail
CONF=/etc/nginx/sites-available/greenfield.conf
[ $# -ge 1 ] || { echo "usage: set-domain.sh <new-domain> [--issue]"; exit 2; }
NEW="$1"
OLD=$(awk '/^\s*server_name/ {print $2; exit}' "$CONF")
OLD="${OLD%;}"
if [ "$OLD" != "$NEW" ]; then
  sed -i "s/\b${OLD//./\\.}\b/${NEW}/g; s/\bwww\.${NEW//./\\.}\b/www.${NEW}/g" "$CONF"
  echo "server_name: $OLD -> $NEW"
fi
if [ "${2:-}" = "--issue" ]; then
  certbot certonly --webroot -w /var/www/le -d "$NEW" -d "www.$NEW" \
    --non-interactive --agree-tos -m admin@checkitout.app
  sed -i "s|ssl_certificate .*|ssl_certificate /etc/letsencrypt/live/${NEW}/fullchain.pem;|" "$CONF"
  sed -i "s|ssl_certificate_key .*|ssl_certificate_key /etc/letsencrypt/live/${NEW}/privkey.pem;|" "$CONF"
  echo "certificate: Let's Encrypt live/${NEW}"
fi
nginx -t && systemctl reload nginx
echo "done — serving $(awk '/^\s*server_name/ {print $2; exit}' "$CONF")"

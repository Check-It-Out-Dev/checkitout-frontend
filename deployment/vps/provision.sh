#!/usr/bin/env bash
# One-shot idempotent provisioning of the greenfield test VPS (run with sudo).
# nginx + checkitout-gate (the htaccess app) + self-signed cert + firewall.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo "[1/6] packages"
apt-get update -q
apt-get install -yq nginx certbot openssl

echo "[2/6] gate app"
install -d -m 755 /opt/checkitout-gate
install -m 644 /tmp/vps/gate.py /opt/checkitout-gate/gate.py
install -d -m 750 -g www-data /etc/checkitout-gate
if [ ! -f /etc/checkitout-gate/key ]; then
  openssl rand -hex 32 > /etc/checkitout-gate/key
fi
cat > /usr/local/bin/gate-passwd <<'PW'
#!/usr/bin/env bash
# gate-passwd — set the gate password (reads it from stdin, no argv leak)
set -euo pipefail
read -r PASSWORD
python3 - "$PASSWORD" <<'PY'
import hashlib, os, sys
salt = os.urandom(16)
h = hashlib.scrypt(sys.argv[1].encode(), salt=salt, n=16384, r=8, p=1)
open("/etc/checkitout-gate/password.scrypt", "w").write(f"{salt.hex()}${h.hex()}")
PY
chgrp www-data /etc/checkitout-gate/password.scrypt
chmod 640 /etc/checkitout-gate/password.scrypt
echo "gate password updated"
PW
chmod 755 /usr/local/bin/gate-passwd
chgrp www-data /etc/checkitout-gate/key
chmod 640 /etc/checkitout-gate/key

cat > /etc/systemd/system/checkitout-gate.service <<'UNIT'
[Unit]
Description=checkitout-gate (auth_request session gate)
After=network.target

[Service]
User=www-data
Group=www-data
ExecStart=/usr/bin/python3 /opt/checkitout-gate/gate.py
Restart=always
RestartSec=2
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadOnlyPaths=/etc/checkitout-gate

[Install]
WantedBy=multi-user.target
UNIT

echo "[3/6] self-signed cert (until DNS points here)"
install -d -m 755 /etc/ssl/cio
if [ ! -f /etc/ssl/cio/selfsigned.crt ]; then
  openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
    -keyout /etc/ssl/cio/selfsigned.key -out /etc/ssl/cio/selfsigned.crt \
    -subj "/CN=check-it-out.pl" \
    -addext "subjectAltName=DNS:check-it-out.pl,DNS:www.check-it-out.pl"
fi

echo "[4/6] nginx"
install -d -m 755 /var/www/check-it-out.pl /var/www/le
chown ubuntu:www-data /var/www/check-it-out.pl
cat > /etc/nginx/conf.d/cio-zones.conf <<'Z'
limit_req_zone $binary_remote_addr zone=cio_general:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=cio_login:10m rate=1r/s;
limit_conn_zone $binary_remote_addr zone=cio_conn_ip:10m;
Z
install -m 644 /tmp/vps/check-it-out.pl.conf /etc/nginx/sites-available/greenfield.conf
ln -sf /etc/nginx/sites-available/greenfield.conf /etc/nginx/sites-enabled/greenfield.conf
rm -f /etc/nginx/sites-enabled/default
install -m 755 /tmp/vps/set-domain.sh /usr/local/bin/set-domain.sh

echo "[5/6] firewall (SSH first, then enable)"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
ufw status | head -8

echo "[6/6] services"
systemctl daemon-reload
systemctl enable --now checkitout-gate
nginx -t
systemctl reload nginx
systemctl is-active nginx checkitout-gate
echo "PROVISION DONE"

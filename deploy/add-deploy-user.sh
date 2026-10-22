#!/usr/bin/env bash
# Run once as root on the server (from Contabo's VNC console). Creates a `deploy` user that
# logs in with the owner's GitHub SSH keys and can use sudo. Changes nothing else: other apps,
# the firewall and the SSH settings stay as they are. Safe to run twice.
set -euo pipefail

id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
curl -fsSL https://github.com/fetehadin.keys > /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
echo "deploy ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/deploy
chmod 440 /etc/sudoers.d/deploy

echo
echo "SSH login rules on this server:"
sshd -T | grep -Ei '^(permitrootlogin|allowusers|allowgroups) ' || true
echo
echo "Done. On your laptop run:  ssh deploy@$(hostname -I | awk '{print $1}') 'echo it works'"

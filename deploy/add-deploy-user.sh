#!/usr/bin/env bash
# Run once as root on the server (from Contabo's VNC console). Creates a `deploy` user that
# logs in with the owner's GitHub SSH keys and may run Docker, but has NO sudo: GitHub Actions
# logs in as `deploy`, so a leaked CI key must not mean root on a server other apps share.
# Changes nothing else: other apps, the firewall and the SSH settings stay as they are (see the
# server checklist in deploy/README.md for those). Safe to run twice: keys already allowed,
# such as the GitHub Actions key, are kept.
set -euo pipefail

GITHUB_USER="${GITHUB_USER:-fetehadin}"
KEYS_FILE=/home/deploy/.ssh/authorized_keys

id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos "" deploy
getent group docker >/dev/null || { echo "Install Docker first (deploy/README.md step 1)." >&2; exit 1; }
usermod -aG docker deploy
# No sudo for deploy, also when an older version of this script gave it.
gpasswd -d deploy sudo >/dev/null 2>&1 || true
rm -f /etc/sudoers.d/deploy

install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
fetched="$(mktemp)"
trap 'rm -f "$fetched"' EXIT
curl -fsSL "https://github.com/${GITHUB_USER}.keys" > "$fetched"
grep -qE '^(ssh-|ecdsa-|sk-)' "$fetched" || {
  echo "github.com/${GITHUB_USER}.keys has no SSH keys. Nothing changed." >&2
  exit 1
}
touch "$KEYS_FILE"
while IFS= read -r key; do
  if [ -n "$key" ] && ! grep -qxF "$key" "$KEYS_FILE"; then
    printf '%s\n' "$key" >> "$KEYS_FILE"
  fi
done < "$fetched"
chown deploy:deploy "$KEYS_FILE"
chmod 600 "$KEYS_FILE"

# The app's folder, made here because deploy can't sudo.
install -d -o deploy -g deploy /srv/voxlace

echo
echo "SSH login rules on this server:"
sshd -T | grep -Ei '^(permitrootlogin|passwordauthentication|allowusers|allowgroups) ' || true
echo
echo "Done. On your laptop run:  ssh deploy@$(hostname -I | awk '{print $1}') 'echo it works'"

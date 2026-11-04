#!/bin/bash
# Server pre Realitný skener (VPS Websupport Starter, Ubuntu 24.04 Minimal).
# Spustenie (ako root, v konzole WebAdminu alebo cez SSH) – jeden riadok, KOD je kód z GitHubu:
#   Settings → Actions → Runners → New self-hosted runner → Linux → v príkaze „./config.sh … --token XXXX“ je XXXX ten kód
#
#   curl -fsSL https://raw.githubusercontent.com/Martin3927/realitny-skener/main/server/instalacia.sh | bash -s -- KOD
#
# Čo urobí:
#  * aktualizácie systému + automatické bezpečnostné aktualizácie (reštart v noci o 4:30, keď ho treba)
#  * firewall: dnu len SSH (všetko ostatné zavreté – skener sa len pripája von)
#  * fail2ban proti hádaniu hesla na SSH, swap 1 GB (Starter má 1 GB RAM), slovenský čas
#  * používateľ „typek“ bez práv správcu a v ňom GitHub runner ako služba (spúšťa sa sám aj po reštarte)
# Skript sa dá spustiť aj znova (napr. s novým kódom) – nič nepokazí.
set -euo pipefail
KOD="${1:-}"
REPO="https://github.com/Martin3927/realitny-skener"
MENO="typek-$(hostname -s)"

if [ "$(id -u)" != 0 ]; then echo "Spusti ako root (sudo)."; exit 1; fi
if [ -z "$KOD" ]; then echo "Chýba kód z GitHubu (Settings → Actions → Runners → New self-hosted runner)."; exit 1; fi

echo "== 1/6 aktualizácie systému"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get -y -q -o Dpkg::Options::=--force-confold upgrade
apt-get -y -q install curl ca-certificates jq tar git python3 python3-venv python3-pip ufw fail2ban unattended-upgrades tzdata

echo "== 2/6 automatické bezpečnostné aktualizácie"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
cat > /etc/apt/apt.conf.d/52typek-upgrades <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";
EOF
timedatectl set-timezone Europe/Bratislava || true

echo "== 3/6 firewall a ochrana SSH"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow OpenSSH >/dev/null
ufw --force enable >/dev/null
systemctl enable --now fail2ban >/dev/null

echo "== 4/6 swap 1 GB"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== 5/6 používateľ typek"
id typek >/dev/null 2>&1 || useradd -m -s /bin/bash typek

echo "== 6/6 GitHub runner"
R=/home/typek/runner
mkdir -p "$R"
if [ ! -x "$R/config.sh" ]; then
  VER=$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest | jq -r .tag_name | sed 's/^v//')
  curl -fsSL -o /tmp/runner.tgz "https://github.com/actions/runner/releases/download/v${VER}/actions-runner-linux-x64-${VER}.tar.gz"
  tar xzf /tmp/runner.tgz -C "$R" && rm /tmp/runner.tgz
  chown -R typek:typek "$R"
  "$R/bin/installdependencies.sh" >/dev/null
fi
cd "$R"
if [ -f .runner ]; then ./svc.sh stop >/dev/null 2>&1 || true; ./svc.sh uninstall >/dev/null 2>&1 || true; su typek -c "./config.sh remove --token $KOD" || true; fi
su typek -c "./config.sh --unattended --url $REPO --token $KOD --name $MENO --labels typek --work _work --replace"
./svc.sh install typek >/dev/null
./svc.sh start >/dev/null

echo
echo "Hotovo. Runner „$MENO“ beží ako služba. Na GitHube ho uvidíš v Settings → Actions → Runners (stav Idle)."
echo "Skener sa naň prepne premennou SKENER_BEZEC = typek (Settings → Secrets and variables → Actions → Variables)."

#!/bin/bash
# BoardScope deb postinst — make OWON USB test gear work out of the box.
#
# OWON scopes/meters (USB 5345:1234) get probed by ModemManager on hotplug,
# which can tear the freshly enumerated serial port back down, and WebSerial
# needs device access for the logged-in user without sudo. This ships the
# udev rule the app previously told users to write by hand (see the
# connection error hint in multimeter.js).
set -e

RULE="/etc/udev/rules.d/71-boardscope-owon.rules"

if [ ! -f "$RULE" ]; then
  cat > "$RULE" <<'EOF'
# BoardScope — OWON test equipment (scopes, meters; USB ID 5345:1234)
# Don't let ModemManager probe it; allow logged-in (seat) users to open it.
SUBSYSTEM=="tty", ATTRS{idVendor}=="5345", ATTRS{idProduct}=="1234", ENV{ID_MM_DEVICE_IGNORE}="1", TAG+="uaccess"
SUBSYSTEM=="usb", ATTRS{idVendor}=="5345", ATTRS{idProduct}=="1234", ENV{ID_MM_DEVICE_IGNORE}="1", TAG+="uaccess"
EOF
  udevadm control --reload-rules 2>/dev/null || true
  udevadm trigger --subsystem-match=tty --subsystem-match=usb 2>/dev/null || true
fi

exit 0

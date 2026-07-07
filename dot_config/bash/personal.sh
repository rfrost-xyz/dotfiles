# Shared personal shell layer for Omarchy and Omaterm.

for d in envs aliases functions init; do
  f="${XDG_CONFIG_HOME:-$HOME/.config}/bash/$d/rc"
  [ -f "$f" ] && source "$f"
done

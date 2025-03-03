
# script to connect KeePassXC to WSL
"/mnt/d/Users/richardf/bin/wsl-ssh-agent-relay" start
export SSH_AUTH_SOCK=${HOME}/.ssh/wsl-ssh-agent.sock

# set starship prompt
eval "$(starship init bash)"
export STARSHIP_CONFIG=~/.config/starship/starship.toml
. "$HOME/.cargo/env"

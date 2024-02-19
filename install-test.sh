#! /bin/bash

# prompt to install lazygit
function lazygit_decision {
  while true; do
    read -p 'Install LazyGit? [y/n] ' lazygit_bool
    case $lazygit_bool in
      [Yy]*) return 0 ;;
      [Nn]*) return 1 ;;
    esac
  done
}

function lazygit_install {
  sudo dnf copr enable atim/lazygit -y
  sudo dnf install lazygit
}

lazygit_decision echo "Press Y or N" && lazygit_install

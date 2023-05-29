#! /bin/bash

# install nerdfont
cd ~/.local/share/fonts
wget https://github.com/ryanoasis/nerd-fonts/releases/latest/download/Meslo.zip
unzip Meslo.zip
rm Meslo.zip
fc-cache

# git configuration
cp .gitconfig ~/

# lazygit
sudo dnf copr enable atim/lazygit -y
sudo dnf install lazygit

# neovim configuration

# install fish and plugins
sudo dnf install fish
fish
curl -sL https://git.io/fisher | source && fisher install jorgebucaran/fisher
fisher install IlanCosman/tide@v5

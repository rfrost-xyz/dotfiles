#! /bin/bash

# install nerdfont
wget https://github.com/ryanoasis/nerd-fonts/releases/latest/download/Meslo.zip
unzip Meslo.zip
sudo cp *.ttf ~/.local/share/fonts
sudo rm Meslo.zip
fc-cache

# git configuration
cp .gitconfig ~/
touch ~/.gitconfig-local

# lazygit
sudo dnf copr enable atim/lazygit -y
sudo dnf install lazygit

# neovim configuration

# install fish and plugins
sudo dnf install fish
fish
curl -sL https://git.io/fisher | source && fisher install jorgebucaran/fisher
fisher install IlanCosman/tide@v5

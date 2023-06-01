#! /bin/bash

# install meslo nerdfont
wget https://github.com/ryanoasis/nerd-fonts/releases/latest/download/Meslo.zip
unzip Meslo.zip
sudo cp *.ttf ~/.local/share/fonts
sudo rm Meslo.zip
fc-cache

# copy base git configuration to home direcory
cp .gitconfig ~/

# create local config ignored by git to store credential
# prompt for user credentials
read -p 'Name: ' name
read -p 'Email: ' email
read -p 'Signing key: ' signingkey

cat >> ~/.gitignore-local << EOF
name = $name
email = $email
signingkey = $signingkey
EOF

# prompt to install lazygit
while true: do
  read -p 'Install LazyGit?' lazygit-bool
  case $lazygit-bool in
    [Yy]* )
      echo "Installing LazyGit"
    ::
    [Nn]* )
      echo "Skipping LazyGit"
    ::
    * ) echo "Answer yes or no"
  essac
done

# lazygit
sudo dnf copr enable atim/lazygit -y
sudo dnf install lazygit

# copy neovim configuration
cp ./nvim/custom/ ~/.config/nvim/lua/

# install fish and plugins
sudo dnf install fish
fish
curl -sL https://git.io/fisher | source && fisher install jorgebucaran/fisher
fisher install IlanCosman/tide@v5

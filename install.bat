ECHO OFF

:: install nerdfont

:: git configuration
copy .gitconfig $HOME/

:: lazygit
winget install JesseDuffield.lazygit

:: terminal configuration
copy ./terminal/windows-terminal-settings.json $HOME/Documents/Windows Terminal/

:: PSreadline

:: powershell configuration

:: neovim configuration
copy ./nvim/custom/ $HOME/AppData/Local/Nvim/custom

:: oh my posh
winget install JanDeDobbeleer.OhMyPosh

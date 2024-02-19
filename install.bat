ECHO OFF

:: Copy configurations
copy .gitconfig $HOME/
copy ./terminal/windows-terminal-settings.json $HOME/Documents/Windows Terminal/
copy ./nvim/custom/ $HOME/AppData/Local/Nvim/custom

:: Install packages through Winget
::winget install JanDeDobbeleer.OhMyPosh
::winget install JesseDuffield.lazygit

:: install nerdfont

:: PSreadline
:: powershell configuration


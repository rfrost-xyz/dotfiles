# Clear logo/header
Clear-Host

# Clear logo/header
Import-Module posh-git
Import-Module oh-my-posh
# Set-Theme Powerline # Powershell
Set-PoshPrompt Powerline # Powershell Core

# Fish-like Autosuggestion
Import-Module PSReadLine
Set-PSReadLineOption -PredictionSource History

# PowerShell offers support for the posh-git module for autocompletion, but it is disabled by default.
$env:POSH_GIT_ENABLED = $true

# Github powershell completion
Invoke-Expression -Command $(gh completion -s powershell | Out-String)

# Aliases
# Copy current path
function Copy-Path-Func {(pwd).Path | CLIP}
Set-Alias Copy-Path Copy-Path-Func

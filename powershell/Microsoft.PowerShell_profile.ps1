# Starship prompt
Invoke-Expression (&starship init powershell)
$ENV:STARSHIP_CONFIG = "\\wsl$\Ubuntu-24.04\home\rfrost\.config\starship\starship.toml"

# Get history alias, adding a caret to the beginning of a string will limit output to results only starting with the string input, for example Get-History-Pattern "^winget install"
function Get-History-Pattern {
    param (
        [string]$Pattern = "winget install"
    )

    $historyPath = "$env:APPDATA\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt"
    if (Test-Path $historyPath) {
        Get-Content $historyPath | Select-String -Pattern $Pattern
    } else {
        Write-Output "History file not found."
    }
}

Set-Alias history-pattern Get-History-Pattern

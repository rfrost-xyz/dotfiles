# Define folder paths and their corresponding destinations

$folders = @(
    @{
        'Source' = ".gitconfig"
        'Destination' = "$HOME\"
    },
    @{
        'Source' = ".\nvim\custom"
        'Destination' = "$HOME\AppData\Local\nvim\"
    },
    @{
        'Source' = ".\powershell\Microsoft.PowerShell_profile.ps1"
        'Destination' = "$HOME\Documents\Powershell\"
    },
    @{
        'Source' = ".\terminal\windows-terminal-settings.json"
        'Destination' = "$HOME\Documents\Windows Terminal\"
    }
d
)



# Function to copy files
function CopyFiles($sourcePath, $destinationPath) {
    Write-Host "+ " -ForegroundColor Green -NoNewLine
    Write-Host "$sourcePath to $destinationPath"
    Copy-Item -Path $sourcePath -Destination $destinationPath -Recurse -Force
}

# Check for folder and copy files
foreach ($folder in $folders) {
	    $sourcePath = $folder['Source']
    $destinationPath = $folder['Destination']

        if (Test-Path $destinationPath) {
		# If path exists, do nothing
            # Write-Host "- " -ForegroundColor Yellow -NoNewLine
            # Write-Host "$destinationPath exists"
        } else {
            # Create folder silently
            New-Item -Path $destinationPath -ItemType Directory -Force | Out-Null

            # Confirm folder has been created
            Write-Host "+ " -ForegroundColor Green -NoNewLine
            Write-Host "$destinationPath has been created"
        }

        # Copy configurations
        CopyFiles $sourcePath $destinationPath
}



Write-Host ""
# ------------------

# Install packages through winget

# Define an array of application names
$appNames = @(
    'git.git',
    'GitHub.GitLFS',
	'jandedobbeleer.ohmyposh',
	'jesseduffield.lazygit'
    # NeoVim
    # NeoVim python

    # GnuPG.Gpg4win
    # Parsec.Parsec
    # 7zip.7zip
    # Perforce.P4V
    # KeePassXCTeam.KeePassXC
    # XP8JK4HZBVF435 (Auto Dark Mode)
    # Microsoft.PowerShell
    # Google.GoogleDrive
    # sharkdp.bat (BAT)
    # Yubico.Authenticator
    #OSGeo.QGIS
	#BlenderFoundation.Blender
#EpicGames.EpicGamesLauncher
#Python.Python.3.9
)

foreach ($appName in $appNames) {
    $appInfo = winget list | Select-String "$appName\s+(\S+)" | ForEach-Object { $_.Matches.Groups[1].Value }

    if ($appInfo) {
        Write-Host "$appName is installed, checking for updates..."
        winget upgrade --id $appName
    } else {
        Write-Host "$appName not installed. Installing..."
        winget install --id $appName
    }

    Write-Host ""
}

# ------------------


# install nerdfont

# https://github.com/ryanoasis/nerd-fonts/releases/download/v3.1.1/Monaspace.zip

# echo "Install fonts"
# $fonts = (New-Object -ComObject Shell.Application).Namespace(0x14)
# foreach ($file in gci *.ttf)
# {
#     $fileName = $file.Name
#     if (-not(Test-Path -Path "C:\Windows\fonts\$fileName" )) {
#         echo $fileName
#         dir $file | %{ $fonts.CopyHere($_.fullname) }
#     }
# }
# cp *.ttf c:\windows\fonts\





# Refine gitconfig, missing user details
# psreadline


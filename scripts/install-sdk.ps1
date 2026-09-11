# One-off: add Windows 11 SDK to the existing VS 2022 Build Tools instance.
# Runs elevated (UAC). Log: scripts\install-sdk.log
$log = "$PSScriptRoot\install-sdk.log"
$setup = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\setup.exe'
$installPath = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools'

"$(Get-Date -Format s) starting modify (adding Windows11SDK.22621)..." | Out-File $log -Encoding utf8

$p = Start-Process -FilePath $setup `
    -ArgumentList @('modify', '--installPath', $installPath, '--add', 'Microsoft.VisualStudio.Component.Windows11SDK.22621', '--quiet', '--norestart', '--nocache') `
    -PassThru -Wait -WindowStyle Hidden
"$(Get-Date -Format s) setup.exe exit code: $($p.ExitCode)" | Out-File $log -Append -Encoding utf8
exit $p.ExitCode

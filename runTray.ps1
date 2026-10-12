Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$bat = "$PSScriptRoot\start.bat"

# spustí .bat bez okna
$proc = Start-Process cmd.exe -ArgumentList "/c `"$bat`"" -WindowStyle Hidden -PassThru

$icon = New-Object System.Windows.Forms.NotifyIcon
$icon.Icon = New-Object System.Drawing.Icon("$PSScriptRoot\favicon.ico")
$icon.Text = "TimeTrack"
$icon.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$menu.Items.Add("Open").add_Click({
    Start-Process "http://localhost:3000"
})
$menu.Items.Add("End").add_Click({
    if (-not $proc.HasExited) { taskkill /PID $proc.Id /T /F | Out-Null }
    $icon.Visible = $false
    [System.Windows.Forms.Application]::Exit()
})
$icon.ContextMenuStrip = $menu

[System.Windows.Forms.Application]::Run()
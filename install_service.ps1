$serviceName = "TilderTempService"
$scriptPath = Join-Path $PSScriptRoot "get_temps_service.ps1"

# Check if service exists
if ((Get-Service -Name $serviceName -ErrorAction SilentlyContinue) -eq $null) {
    Write-Host "Creating Windows service $serviceName"
    sc create $serviceName binPath= "powershell -ExecutionPolicy Bypass -File \"$scriptPath\"" start= auto
} else {
    Write-Host "Service $serviceName already exists, ensuring it is set to Automatic"
    Set-Service -Name $serviceName -StartupType Automatic
    Start-Service -Name $serviceName -ErrorAction SilentlyContinue
}

# Starts the crew.com server with the Supabase service-role key taken from a HIDDEN prompt.
# The key lives only in this process's environment: it is never written to a file or echoed.
# Usage:  .\scripts\start-with-key.ps1            (port 3004)
#         .\scripts\start-with-key.ps1 -Port 3005
param([int]$Port = 3004)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

$secure = Read-Host 'Paste the service_role key (input is hidden), then press Enter' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
if (-not $key) { throw 'No key was entered.' }
if ($key.StartsWith('sb_publishable_')) { throw 'That is the PUBLISHABLE key. Paste the service_role / secret key instead.' }

$env:SUPABASE_SERVICE_ROLE_KEY = $key
$env:PORT = "$Port"
$env:CREW_PUBLIC_URL = "http://localhost:$Port"
Write-Host "Key received (length $($key.Length)). Starting crew.com on port $Port ..."
npm start

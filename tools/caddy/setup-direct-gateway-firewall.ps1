$ErrorActionPreference = 'Stop'

netsh advfirewall firewall add rule name="Cards Direct Gateway 80" dir=in action=allow protocol=TCP localport=80
netsh advfirewall firewall add rule name="Cards Direct Gateway 443" dir=in action=allow protocol=TCP localport=443

Write-Output 'Firewall rules created.'

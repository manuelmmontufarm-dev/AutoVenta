# Diagnostico para el conector de AutoVenta.
#
# Que hace: mira este equipo y escribe "diagnostico-fenix.txt" con lo que
# necesitamos saber para leer Fenix: que Windows es, que base de datos hay
# instalada, donde esta instalado Fenix y como se conecta a su base.
#
# SOLO LEE. No instala nada, no cambia nada, no abre Fenix, no manda nada por
# internet. Las claves que encuentre en archivos de configuracion las TAPA
# antes de escribirlas (********).
#
# Escrito para que corra hasta en un Windows viejo (PowerShell 2.0), y sin
# tildes a proposito: asi se lee igual en cualquier consola.

$ErrorActionPreference = 'SilentlyContinue'

$carpeta = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $carpeta) { $carpeta = (Get-Location).Path }
$salida = Join-Path $carpeta 'diagnostico-fenix.txt'
$lineas = New-Object System.Collections.ArrayList

function Di($texto) {
  [void]$lineas.Add([string]$texto)
  Write-Host $texto
}

function Seccion($titulo, [scriptblock]$bloque) {
  Di ''
  Di ('=== ' + $titulo + ' ===')
  try { & $bloque } catch { Di ('  (no se pudo leer: ' + $_.Exception.Message + ')') }
}

# Tapa lo que parezca una clave: password=xxx, pwd: xxx, usuario:clave@servidor.
function Tapar($texto) {
  $t = [string]$texto
  $t = [regex]::Replace($t, '(?i)((pass(word)?|pwd|clave|contrase[^=:\s]*|secret|token|api_?key)\s*["'']?\s*[=:]\s*["'']?)([^;"''\s<&]+)', '${1}********')
  $t = [regex]::Replace($t, '(://[^:/@\s]+:)([^@/\s]+)@', '${1}********@')
  return $t
}

# Nombres que delatan una base de datos o al propio Fenix.
$patronBase = 'sql|postgres|pgsql|mysql|maria|firebird|interbase|fbserver|fbguard|oracle|sybase|sqlany|dbsrv|db2|mongo|pervasive|btrieve|advantage'
$patronFenix = 'fenix|zeus|adssoft|ads soft|ads_soft'

$puertosConocidos = @{
  '1433' = 'SQL Server'; '1434' = 'SQL Server (browser)'; '5432' = 'PostgreSQL'; '5433' = 'PostgreSQL';
  '3306' = 'MySQL / MariaDB'; '3307' = 'MySQL / MariaDB'; '3050' = 'Firebird / InterBase';
  '1521' = 'Oracle'; '2638' = 'SQL Anywhere (Sybase)'; '50000' = 'DB2'; '27017' = 'MongoDB';
  '6262' = 'Advantage Database'; '3351' = 'Pervasive'
}

$carpetasCandidatas = New-Object System.Collections.ArrayList
function Anotar-Carpeta($ruta) {
  if (-not $ruta) { return }
  $r = ([string]$ruta).Trim().Trim('"').TrimEnd('\')
  if ($r.Length -lt 4) { return }
  if (-not (Test-Path -LiteralPath $r)) { return }
  if (-not $carpetasCandidatas.Contains($r.ToLower())) { [void]$carpetasCandidatas.Add($r.ToLower()) }
}

Di 'Diagnostico para el conector de AutoVenta'
Di ('Fecha: ' + (Get-Date).ToString('yyyy-MM-dd HH:mm'))

Seccion 'Este equipo' {
  $os = Get-WmiObject Win32_OperatingSystem
  $pc = Get-WmiObject Win32_ComputerSystem
  Di ('  Nombre:      ' + $env:COMPUTERNAME)
  Di ('  Windows:     ' + $os.Caption + ' (version ' + $os.Version + ', ' + $os.OSArchitecture + ')')
  Di ('  PowerShell:  ' + $PSVersionTable.PSVersion.ToString())
  $net = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full'
  if ($net) { Di ('  .NET 4:      ' + $net.Version + ' (release ' + $net.Release + ')') }
  if ($pc.TotalPhysicalMemory) { Di ('  Memoria:     ' + [math]::Round($pc.TotalPhysicalMemory / 1GB, 1) + ' GB') }
  if ($os.LastBootUpTime) {
    $arranque = [System.Management.ManagementDateTimeConverter]::ToDateTime($os.LastBootUpTime)
    $dias = [math]::Round(((Get-Date) - $arranque).TotalDays, 1)
    Di ('  Prendido desde: ' + $arranque.ToString('yyyy-MM-dd HH:mm') + ' (' + $dias + ' dias). Sirve para saber si lo apagan de noche.')
  }
  Di ('  Usuario que corre esto: ' + $env:USERNAME)
}

Seccion 'Servicios de bases de datos y de Fenix' {
  $hay = $false
  foreach ($s in (Get-WmiObject Win32_Service)) {
    if (-not $s) { continue }
    $junto = ([string]$s.Name + ' ' + [string]$s.DisplayName + ' ' + [string]$s.PathName)
    if ($junto -match $patronBase -or $junto -match $patronFenix) {
      $hay = $true
      Di ('  ' + $s.Name + '  [' + $s.State + ', arranque ' + $s.StartMode + ']  ' + $s.DisplayName)
      Di ('      ' + $s.PathName)
      if ($junto -match $patronFenix -and $s.PathName) {
        $exe = ([string]$s.PathName).Trim()
        if ($exe.StartsWith('"')) { $exe = $exe.Substring(1); $exe = $exe.Substring(0, [math]::Max(0, $exe.IndexOf('"'))) }
        Anotar-Carpeta (Split-Path -Parent $exe)
      }
    }
  }
  if (-not $hay) { Di '  Ninguno. (La base puede estar en OTRA maquina: ver los accesos directos y la configuracion mas abajo.)' }
}

Seccion 'Puertos abiertos de bases de datos' {
  $hay = $false
  $vistos = @{}
  foreach ($linea in (netstat -ano)) {
    $p = ([string]$linea).Trim() -split '\s+'
    if ($p.Length -lt 5) { continue }
    if ($p[0] -ne 'TCP') { continue }
    # Una fila que escucha tiene como destino 0.0.0.0:0 o [::]:0, en cualquier idioma.
    if ($p[2] -ne '0.0.0.0:0' -and $p[2] -ne '[::]:0') { continue }
    $puerto = $p[1].Substring($p[1].LastIndexOf(':') + 1)
    $idProceso = $p[$p.Length - 1]
    $proceso = (Get-Process -Id $idProceso).ProcessName
    $esConocido = $puertosConocidos.ContainsKey($puerto)
    $esDeBase = ([string]$proceso -match $patronBase) -or ([string]$proceso -match $patronFenix)
    if (-not ($esConocido -or $esDeBase)) { continue }
    $llave = $puerto + '/' + $idProceso
    if ($vistos.ContainsKey($llave)) { continue }
    $vistos[$llave] = $true
    $hay = $true
    $que = ''
    if ($esConocido) { $que = '  <- puerto tipico de ' + $puertosConocidos[$puerto] }
    Di ('  puerto ' + $puerto + '  proceso ' + $proceso + ' (PID ' + $idProceso + ')' + $que)
  }
  if (-not $hay) { Di '  Ninguno en esta maquina.' }
}

Seccion 'Programas corriendo ahora (bases de datos y Fenix)' {
  $hay = $false
  foreach ($proc in (Get-Process)) {
    $junto = ([string]$proc.ProcessName + ' ' + [string]$proc.Path)
    if ($junto -match $patronBase -or $junto -match $patronFenix) {
      $hay = $true
      Di ('  ' + $proc.ProcessName + '  ' + $proc.Path)
      if ($junto -match $patronFenix -and $proc.Path) { Anotar-Carpeta (Split-Path -Parent $proc.Path) }
    }
  }
  if (-not $hay) { Di '  Ninguno. (Si Fenix no esta abierto, abralo y vuelva a correr esto.)' }
}

Seccion 'Motores de base de datos instalados (registro de Windows)' {
  $hay = $false
  foreach ($raiz in @('HKLM:\SOFTWARE', 'HKLM:\SOFTWARE\WOW6432Node')) {
    $sqlServer = Get-ItemProperty ($raiz + '\Microsoft\Microsoft SQL Server\Instance Names\SQL')
    if ($sqlServer) {
      foreach ($prop in $sqlServer.PSObject.Properties) {
        if ($prop.Name -notlike 'PS*') { $hay = $true; Di ('  SQL Server, instancia: ' + $prop.Name + '  (' + $prop.Value + ')') }
      }
    }
    foreach ($k in (Get-ChildItem ($raiz + '\PostgreSQL\Installations'))) {
      if (-not $k) { continue }
      $v = Get-ItemProperty $k.PSPath
      $hay = $true
      Di ('  PostgreSQL ' + $v.Version + '  programa: ' + $v.'Base Directory' + '  datos: ' + $v.'Data Directory')
    }
    foreach ($k in (Get-ChildItem ($raiz + '\PostgreSQL\Services'))) {
      if (-not $k) { continue }
      $v = Get-ItemProperty $k.PSPath
      Di ('  PostgreSQL servicio ' + $k.PSChildName + '  puerto: ' + $v.Port + '  usuario: ' + $v.'Database Superuser')
    }
    $fb = Get-ItemProperty ($raiz + '\Firebird Project\Firebird Server\Instances')
    if ($fb) {
      foreach ($prop in $fb.PSObject.Properties) {
        if ($prop.Name -notlike 'PS*') { $hay = $true; Di ('  Firebird, instancia: ' + $prop.Name + '  en ' + $prop.Value) }
      }
    }
    foreach ($k in (Get-ChildItem ($raiz + '\MySQL AB'))) {
      if (-not $k) { continue }
      $v = Get-ItemProperty $k.PSPath
      $hay = $true
      Di ('  ' + $k.PSChildName + '  version ' + $v.Version + '  en ' + $v.Location + '  datos: ' + $v.DataLocation)
    }
  }
  if (-not $hay) { Di '  Ninguno registrado.' }
}

Seccion 'Programas instalados que importan' {
  $hay = $false
  $claves = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
  )
  $vistos = @{}
  foreach ($clave in $claves) {
    foreach ($p in (Get-ItemProperty $clave)) {
      if (-not $p) { continue }
      $nombre = [string]$p.DisplayName
      if (-not $nombre) { continue }
      if ($nombre -match $patronBase -or $nombre -match $patronFenix -or $nombre -match 'odbc|native client|ole ?db|connector|anydesk|teamviewer') {
        if ($vistos.ContainsKey($nombre)) { continue }
        $vistos[$nombre] = $true
        $hay = $true
        Di ('  ' + $nombre + '  ' + $p.DisplayVersion + '  ' + $p.InstallLocation)
        if ($nombre -match $patronFenix) { Anotar-Carpeta $p.InstallLocation }
      }
    }
  }
  if (-not $hay) { Di '  Ninguno.' }
}

Seccion 'Accesos directos de Fenix' {
  $hay = $false
  $shell = New-Object -ComObject WScript.Shell
  $lugares = @($env:PUBLIC + '\Desktop', $env:ProgramData + '\Microsoft\Windows\Start Menu')
  foreach ($u in (Get-ChildItem 'C:\Users' | Where-Object { $_.PSIsContainer })) {
    if (-not $u) { continue }
    $lugares += ($u.FullName + '\Desktop')
    $lugares += ($u.FullName + '\AppData\Roaming\Microsoft\Windows\Start Menu')
  }
  foreach ($lugar in $lugares) {
    if (-not (Test-Path -LiteralPath $lugar)) { continue }
    foreach ($lnk in (Get-ChildItem -LiteralPath $lugar -Recurse -Filter '*.lnk')) {
      if (-not $lnk) { continue }
      $acceso = $shell.CreateShortcut($lnk.FullName)
      $junto = ($lnk.Name + ' ' + $acceso.TargetPath)
      if ($junto -match $patronFenix) {
        $hay = $true
        Di ('  ' + $lnk.Name)
        Di ('      abre:      ' + $acceso.TargetPath + ' ' + (Tapar $acceso.Arguments))
        Di ('      inicia en: ' + $acceso.WorkingDirectory)
        Anotar-Carpeta $acceso.WorkingDirectory
        if ($acceso.TargetPath) { Anotar-Carpeta (Split-Path -Parent $acceso.TargetPath) }
      }
    }
  }
  if (-not $hay) { Di '  No encontre ninguno con "fenix" en el nombre. Digame como se llama el icono con el que abren el sistema.' }
}

Seccion 'Carpetas con nombre de Fenix' {
  $raices = @()
  foreach ($d in (Get-WmiObject Win32_LogicalDisk | Where-Object { $_.DriveType -eq 3 })) { if (-not $d) { continue }; $raices += ($d.DeviceID + '\') }
  if ($env:ProgramFiles) { $raices += $env:ProgramFiles }
  if (${env:ProgramFiles(x86)}) { $raices += ${env:ProgramFiles(x86)} }
  if ($env:ProgramData) { $raices += $env:ProgramData }
  foreach ($raiz in $raices) {
    foreach ($dir in (Get-ChildItem -LiteralPath $raiz | Where-Object { $_.PSIsContainer })) {
      if (-not $dir) { continue }
      if ($dir.Name -match $patronFenix) { Anotar-Carpeta $dir.FullName }
    }
  }
  if ($carpetasCandidatas.Count -eq 0) { Di '  Ninguna. (Fenix puede abrirse desde una carpeta de red: ver los accesos directos.)' }
  foreach ($c in $carpetasCandidatas) { Di ('  ' + $c) }
}

# Extensiones que cuentan algo: programas, configuracion y archivos de base de datos.
$extensiones = @{}
foreach ($e in @('.exe', '.ini', '.cfg', '.conf', '.config', '.udl', '.dsn', '.xml', '.json', '.properties', '.fdb', '.gdb', '.ib', '.mdf', '.ldf', '.mdb', '.accdb', '.dbf', '.dbc', '.db', '.sqlite', '.add', '.adt', '.bak', '.backup', '.sql', '.jar')) { $extensiones[$e] = $true }
$deConfiguracion = @{}
foreach ($e in @('.ini', '.cfg', '.conf', '.config', '.udl', '.dsn', '.properties', '.xml', '.json')) { $deConfiguracion[$e] = $true }
$patronDll = 'npgsql|libpq|mysql|maria|firebird|fbclient|gds32|ibase|oci|oracle|sqlncli|msoledbsql|sqlite|sybase|dbexp|zeos|unidac|devart|midas|ace32|adsloc|odbc|jdbc'

foreach ($candidata in $carpetasCandidatas) {
  Seccion ('Dentro de ' + $candidata) {
    # Dos niveles, sin recursion: una carpeta con miles de respaldos no cuelga esto.
    $archivos = @()
    $nivel1 = Get-ChildItem -LiteralPath $candidata
    foreach ($x in $nivel1) {
      if (-not $x) { continue }
      if ($x.PSIsContainer) {
        foreach ($y in (Get-ChildItem -LiteralPath $x.FullName | Where-Object { -not $_.PSIsContainer })) { if ($y) { $archivos += $y } }
      } else { $archivos += $x }
    }
    $mostrados = 0
    $configs = @()
    foreach ($f in ($archivos | Sort-Object FullName)) {
      if (-not $f) { continue }
      $ext = ([string]$f.Extension).ToLower()
      $sirve = $extensiones.ContainsKey($ext) -or ($ext -eq '.dll' -and $f.Name -match $patronDll)
      if (-not $sirve) { continue }
      if ($mostrados -lt 300) {
        $relativo = $f.FullName.Substring($candidata.Length).TrimStart('\')
        Di ('  ' + $relativo + '   ' + [math]::Round($f.Length / 1KB) + ' KB   ' + $f.LastWriteTime.ToString('yyyy-MM-dd'))
      }
      $mostrados++
      if ($deConfiguracion.ContainsKey($ext) -and $f.Length -lt 65536 -and $configs.Count -lt 15) { $configs += $f }
    }
    if ($mostrados -eq 0) { Di '  (nada que parezca programa, configuracion o base de datos en los dos primeros niveles)' }
    if ($mostrados -gt 300) { Di ('  ... y ' + ($mostrados - 300) + ' archivos mas.') }
    foreach ($f in $configs) {
      Di ''
      Di ('  --- ' + $f.FullName + ' (primeras 60 lineas, claves tapadas) ---')
      foreach ($l in (Get-Content -LiteralPath $f.FullName -TotalCount 60)) {
        $limpia = ([string]$l) -replace '[^\x20-\x7E\u00A0-\u00FF]', '?'
        if ($limpia.Length -gt 300) { $limpia = $limpia.Substring(0, 300) + ' ...' }
        Di ('  | ' + (Tapar $limpia))
      }
    }
  }
}

Seccion 'Conexiones ODBC configuradas' {
  $hay = $false
  foreach ($raiz in @('HKLM:\SOFTWARE\ODBC\ODBC.INI', 'HKLM:\SOFTWARE\WOW6432Node\ODBC\ODBC.INI', 'HKCU:\SOFTWARE\ODBC\ODBC.INI')) {
    $fuentes = Get-ItemProperty ($raiz + '\ODBC Data Sources')
    if (-not $fuentes) { continue }
    foreach ($prop in $fuentes.PSObject.Properties) {
      if ($prop.Name -like 'PS*') { continue }
      $hay = $true
      Di ('  ' + $prop.Name + '  (controlador: ' + $prop.Value + ')  [' + $raiz + ']')
      $detalle = Get-ItemProperty ($raiz + '\' + $prop.Name)
      foreach ($d in $detalle.PSObject.Properties) {
        if ($d.Name -like 'PS*') { continue }
        if ($d.Name -match '(?i)pass|pwd|clave') { continue }
        if ($d.Name -match '(?i)server|host|database|dbname|dbq|port|uid|user|description') { Di ('      ' + $d.Name + ' = ' + $d.Value) }
      }
    }
  }
  if (-not $hay) { Di '  Ninguna.' }
  Di ''
  Di '  Controladores ODBC instalados:'
  foreach ($raiz in @('HKLM:\SOFTWARE\ODBC\ODBCINST.INI\ODBC Drivers', 'HKLM:\SOFTWARE\WOW6432Node\ODBC\ODBCINST.INI\ODBC Drivers')) {
    $drivers = Get-ItemProperty $raiz
    if (-not $drivers) { continue }
    foreach ($prop in $drivers.PSObject.Properties) {
      if ($prop.Name -notlike 'PS*') { Di ('      ' + $prop.Name) }
    }
  }
}

Seccion 'Unidades de red (por si Fenix se abre desde otra maquina)' {
  $hay = $false
  foreach ($d in (Get-WmiObject Win32_LogicalDisk | Where-Object { $_.DriveType -eq 4 })) {
    if (-not $d) { continue }
    $hay = $true
    Di ('  ' + $d.DeviceID + '  ->  ' + $d.ProviderName)
  }
  if (-not $hay) { Di '  Ninguna.' }
}

Di ''
Di '=== Fin ==='

$lineas | Out-File -FilePath $salida -Encoding UTF8
Write-Host ''
Write-Host ('Listo. Mande este archivo a Manuel: ' + $salida)

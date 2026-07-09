# leer-xlsx.ps1 — Extrae el contenido de un .xlsx/.xlsm sin Excel instalado.
# Un archivo Excel moderno es un ZIP con XML: se listan las hojas y se
# vuelca cada una como texto delimitado por tabulaciones a stdout.
# Uso: powershell -File leer-xlsx.ps1 -Ruta <archivo> [-Hoja <nombre>] [-MaxFilas <n>]
param(
  [Parameter(Mandatory = $true)][string]$Ruta,
  [string]$Hoja = '',
  [int]$MaxFilas = 0
)

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($Ruta)
try {
  function LeerEntrada($nombre) {
    $entrada = $zip.GetEntry($nombre)
    if (-not $entrada) { return $null }
    $lector = New-Object System.IO.StreamReader($entrada.Open())
    try { return $lector.ReadToEnd() } finally { $lector.Dispose() }
  }

  # Hojas: nombre visible -> archivo interno (via rels)
  [xml]$workbook = LeerEntrada 'xl/workbook.xml'
  [xml]$rels = LeerEntrada 'xl/_rels/workbook.xml.rels'
  $mapaRels = @{}
  foreach ($r in $rels.Relationships.Relationship) {
    $mapaRels[$r.Id] = $r.Target -replace '^/?(xl/)?', 'xl/'
  }
  $hojas = @()
  foreach ($s in $workbook.workbook.sheets.sheet) {
    $rid = $s.GetAttribute('r:id')
    $hojas += [pscustomobject]@{ Nombre = $s.name; Archivo = $mapaRels[$rid] }
  }

  if (-not $Hoja) {
    Write-Output 'HOJAS DISPONIBLES:'
    $hojas | ForEach-Object { Write-Output ("  - " + $_.Nombre + "  (" + $_.Archivo + ")") }
    return
  }

  $sel = $hojas | Where-Object { $_.Nombre -eq $Hoja } | Select-Object -First 1
  if (-not $sel) { throw "Hoja no encontrada: $Hoja" }

  # Cadenas compartidas (los textos de las celdas suelen vivir aquí)
  $compartidas = @()
  $ssXmlRaw = LeerEntrada 'xl/sharedStrings.xml'
  if ($ssXmlRaw) {
    [xml]$ssXml = $ssXmlRaw
    foreach ($si in $ssXml.sst.si) {
      if ($si.t -is [System.Xml.XmlElement]) { $compartidas += $si.t.InnerText }
      elseif ($null -ne $si.t) { $compartidas += [string]$si.t }
      else {
        # texto enriquecido: concatenar runs
        $texto = ''
        foreach ($r in $si.r) { $texto += $r.t.InnerText }
        $compartidas += $texto
      }
    }
  }

  function ColumnaIndice([string]$refCelda) {
    $letras = ($refCelda -replace '\d', '')
    $n = 0
    foreach ($c in $letras.ToCharArray()) { $n = $n * 26 + ([int]$c - 64) }
    return $n
  }

  [xml]$hojaXml = LeerEntrada $sel.Archivo
  $filas = $hojaXml.worksheet.sheetData.row
  $contador = 0
  foreach ($fila in $filas) {
    if ($MaxFilas -gt 0 -and $contador -ge $MaxFilas) { break }
    $celdas = @{}
    $maxCol = 0
    foreach ($c in $fila.c) {
      $idx = ColumnaIndice $c.r
      if ($idx -gt $maxCol) { $maxCol = $idx }
      $valor = ''
      if ($c.t -eq 's') { $valor = $compartidas[[int]$c.v] }
      elseif ($c.t -eq 'inlineStr') { $valor = $c.is.t.InnerText }
      elseif ($null -ne $c.v) { $valor = [string]$c.v }
      $celdas[$idx] = $valor
    }
    $linea = @()
    for ($i = 1; $i -le $maxCol; $i++) {
      if ($celdas.ContainsKey($i)) { $linea += $celdas[$i] } else { $linea += '' }
    }
    Write-Output ($linea -join "`t")
    $contador++
  }
} finally {
  $zip.Dispose()
}

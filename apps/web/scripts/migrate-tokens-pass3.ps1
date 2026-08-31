$root = "$PSScriptRoot\..\src"
$files = Get-ChildItem -Path $root -Recurse -Include *.tsx,*.jsx,*.css
$replacements = [ordered]@{
  '--fl-border' = '--brand-border'
  '--fl-surface' = '--brand-surface'
  '--fl-canvas' = '--brand-canvas'
  '--fl-text' = '--brand-text-primary'
  '--fl-subtext' = '--brand-text-secondary'
  '--fl-accent' = '--brand-primary'
  '--fl-critical' = '--brand-danger'
  '--fl-amber' = '--brand-warning'
  'fill="#0D9488"' = 'fill="var(--brand-secondary)"'
  'fill="#D97706"' = 'fill="var(--brand-warning)"'
  'fill="#DC2626"' = 'fill="var(--brand-danger)"'
  'fill="#64748b"' = 'fill="var(--brand-chart-muted)"'
  'fill="#6366f1"' = 'fill="var(--brand-secondary)"'
  'stroke="#22d3ee"' = 'stroke="var(--brand-primary)"'
  'stopColor="#22d3ee"' = 'stopColor="var(--brand-primary)"'
  '#6366f1' = 'var(--brand-secondary)'
  'themeColor: "#050B14"' = 'themeColor: darkTokens.canvas'
}
$count = 0
foreach ($file in $files) {
  $content = Get-Content -Raw -LiteralPath $file.FullName
  $original = $content
  foreach ($key in $replacements.Keys) {
    $content = $content.Replace($key, $replacements[$key])
  }
  if ($content -ne $original) {
    [System.IO.File]::WriteAllText($file.FullName, $content)
    $count++
  }
}
Write-Host "Pass 3 updated $count files"

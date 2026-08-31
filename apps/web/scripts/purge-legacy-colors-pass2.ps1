$root = Join-Path $PSScriptRoot "..\src"
$replacements = [ordered]@{
  'tone="emerald"' = 'tone="success"'
  'tone="rose"' = 'tone="danger"'
  'tone="amber"' = 'tone="warning"'
  'tone="cyan"' = 'tone="info"'
  'tone="slate"' = 'tone="info"'
  'tone="signal"' = 'tone="danger"'
  '"emerald"' = '"success"'
  '"rose"' = '"danger"'
  '"amber"' = '"warning"'
  '"cyan"' = '"info"'
  '"slate"' = '"info"'
  'text-amber-400' = 'text-brand-warning'
  'text-amber-500' = 'text-brand-warning'
  'text-amber-300' = 'text-brand-warning'
  'border-amber-500/50' = 'border-brand-warning/50'
  'border-amber-500/40' = 'border-brand-warning/40'
  'text-cyan-400' = 'text-brand-primary'
  'text-indigo-400' = 'text-brand-secondary'
  'text-rose-600 dark:text-brand-danger' = 'text-brand-danger'
  'border-teal-500/50 bg-teal-500/10' = 'border-brand-secondary/50 bg-brand-secondary/10'
  'border-amber-500/40 bg-brand-warning/15 text-amber-300' = 'border-brand-warning/40 bg-brand-warning/15 text-brand-warning'
}

Get-ChildItem -Path $root -Recurse -Include *.tsx,*.jsx | ForEach-Object {
  $content = Get-Content $_.FullName -Raw -Encoding UTF8
  $orig = $content
  foreach ($pair in $replacements.GetEnumerator()) {
    $content = $content.Replace($pair.Key, $pair.Value)
  }
  if ($content -ne $orig) {
    Set-Content -Path $_.FullName -Value $content -Encoding UTF8 -NoNewline
    Write-Output "Updated: $($_.Name)"
  }
}

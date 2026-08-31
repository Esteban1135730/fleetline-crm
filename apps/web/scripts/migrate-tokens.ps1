$files = Get-ChildItem -Path "$PSScriptRoot\..\src" -Recurse -Include *.tsx,*.jsx,*.css
$replacements = [ordered]@{
  'var\(--brand-muted\)' = 'var(--brand-text-secondary)'
  'var\(--brand-line\)' = 'var(--brand-border)'
  'var\(--brand-ink\)' = 'var(--brand-text-primary)'
  'var\(--brand-signal' = 'var(--brand-danger'
  'var\(--brand-amber' = 'var(--brand-warning'
  'var\(--brand-emerald\)' = 'var(--brand-success)'
  'var\(--brand-surface-2\)' = 'var(--brand-surface-elevated)'
  'var\(--brand-surface-2,' = 'var(--brand-surface-elevated,'
  'var\(--accent-primary\)' = 'var(--brand-primary)'
  'var\(--accent-secondary\)' = 'var(--brand-secondary)'
  'var\(--accent-metric' = 'var(--brand-warning'
  'var\(--accent-alert' = 'var(--brand-danger'
  'var\(--text-primary\)' = 'var(--brand-text-primary)'
  'var\(--text-secondary\)' = 'var(--brand-text-secondary)'
  'var\(--border-subtle\)' = 'var(--brand-border)'
  'var\(--bg-canvas\)' = 'var(--brand-canvas)'
  'var\(--bg-surface-1\)' = 'var(--brand-surface)'
  'var\(--bg-surface-2\)' = 'var(--brand-surface-elevated)'
  'var\(--glow-active\)' = 'var(--brand-glow-active)'
  'var\(--glow-text\)' = 'var(--brand-glow-text)'
  'var\(--chart-grid\)' = 'var(--brand-chart-grid)'
  'fsg-panel' = 'nexa-panel'
  'bg-\[#0[Aa]0[Dd]14\]' = 'bg-brand-canvas'
  '!bg-\[#0[Aa]0[Dd]14\]' = '!bg-brand-canvas'
  'bg-\[#10B981\]' = 'bg-brand-success'
  'bg-\[#FFB800\]' = 'bg-brand-warning'
  'bg-\[#FF2A5F\]' = 'bg-brand-danger'
  'bg-\[#2563EB\]' = 'bg-brand-secondary'
  'bg-\[#64748B\]' = 'bg-brand-info'
  'text-\[#10B981\]' = 'text-brand-success'
  'text-\[#FFB800\]' = 'text-brand-warning'
  'text-\[#FF2A5F\]' = 'text-brand-danger'
  'text-\[#FF2A55\]' = 'text-brand-danger'
  'text-\[#0D9488\]' = 'text-brand-secondary'
  'text-\[#DC2626\]' = 'text-brand-danger'
  'text-\[#64748B\]' = 'text-brand-text-secondary'
  'text-\[#94A3B8\]' = 'text-brand-text-secondary'
  'text-\[#FECDD3\]' = 'text-brand-danger'
  'text-\[#1a1200\]' = 'text-brand-on-warning'
  'text-\[#04110c\]' = 'text-brand-on-primary'
  'text-\[#0A0D14\]' = 'text-brand-on-warning'
  'border-\[#10B981\]' = 'border-brand-success'
  'border-\[#FF2A5F\]' = 'border-brand-danger'
  'border-\[#0D9488\]' = 'border-brand-secondary'
  'border-\[#DC2626\]' = 'border-brand-danger'
  'border-\[#D97706\]' = 'border-brand-warning'
  'border-\[#FFB800\]' = 'border-brand-warning'
  '!bg-\[#FF2A5F\]' = '!bg-brand-danger'
  '!bg-\[#FFB800\]' = '!bg-brand-warning'
  'from-\[#0D9488\]' = 'from-brand-secondary'
  'to-\[#10B981\]' = 'to-brand-success'
  'shadow-\[0_0_20px_#10B981\]' = 'shadow-[0_0_20px_var(--brand-success)]'
  'shadow-\[0_0_40px_rgba\(13,148,136,0\.45\)\]' = 'shadow-[0_0_40px_var(--brand-primary-glow)]'
}
$count = 0
foreach ($file in $files) {
  $content = Get-Content -Raw -LiteralPath $file.FullName
  $original = $content
  foreach ($key in $replacements.Keys) {
    $content = [regex]::Replace($content, $key, $replacements[$key])
  }
  if ($content -ne $original) {
    [System.IO.File]::WriteAllText($file.FullName, $content)
    $count++
  }
}
Write-Host "Updated $count files"

$root = Join-Path $PSScriptRoot "..\src"
$replacements = [ordered]@{
  'text-slate-500' = 'text-brand-text-secondary'
  'text-slate-400' = 'text-brand-text-secondary'
  'text-slate-300' = 'text-brand-text-secondary'
  'text-slate-100' = 'text-brand-text-primary'
  'text-slate-200' = 'text-brand-text-primary'
  'bg-slate-800/80' = 'bg-brand-surface-elevated/80'
  'bg-slate-800' = 'bg-brand-surface-elevated'
  'border-slate-700' = 'border-brand-border'
  'border-slate-600' = 'border-brand-border'
  'border-slate-800' = 'border-brand-border'
  'bg-zinc-900/80' = 'bg-brand-surface/80'
  'text-emerald-700 dark:text-emerald-300' = 'text-brand-success'
  'text-emerald-700' = 'text-brand-success'
  'text-emerald-300' = 'text-brand-success'
  'text-emerald-400' = 'text-brand-success'
  'text-emerald-500' = 'text-brand-success'
  'text-rose-300' = 'text-brand-danger'
  'border-emerald-500/40 bg-emerald-500/15 text-emerald-300' = 'border-brand-success/40 bg-brand-success/15 text-brand-success'
  'border-emerald-500/30 bg-emerald-500/10' = 'border-brand-success/30 bg-brand-success/10'
  'border-emerald-500 bg-emerald-500/10' = 'border-brand-success bg-brand-success/10'
  'bg-emerald-500/20 text-emerald-300' = 'bg-brand-success/20 text-brand-success'
  'bg-emerald-500/15' = 'bg-brand-success/15'
  'bg-emerald-500/10' = 'bg-brand-success/10'
  'bg-emerald-500' = 'bg-brand-success'
  'border-emerald-500' = 'border-brand-success'
  'border-rose-500' = 'border-brand-danger'
  'bg-rose-500' = 'bg-brand-danger'
  'bg-amber-500' = 'bg-brand-warning'
  'bg-slate-500/20' = 'bg-brand-info/20'
  'bg-red-900/40' = 'bg-brand-danger/40'
  'bg-cyan-500/15 text-cyan-400' = 'bg-brand-primary/15 text-brand-primary'
  'border-slate-600 bg-slate-800/80 text-slate-300' = 'border-brand-border bg-brand-surface-elevated/80 text-brand-text-secondary'
  'shadow-[0_10px_30px_rgba(0,0,0,0.04)]' = 'shadow-brand-panel'
  'border-[rgba(255,42,95,0.35)] bg-[rgba(255,42,95,0.08)]' = 'border-brand-danger/35 bg-brand-danger/10'
  'border-[rgba(16,185,129,0.35)] bg-[rgba(16,185,129,0.08)]' = 'border-brand-success/35 bg-brand-success/10'
  'shadow-[0_0_0_1px_rgba(255,255,255,0.02)]' = 'shadow-[var(--brand-shadow-inset)]'
  'bg-[var(--bg-surface)]' = 'bg-brand-surface'
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

$files = Get-ChildItem -Path "$PSScriptRoot\..\src" -Recurse -Include *.tsx,*.jsx
$replacements = [ordered]@{
  ',\#[0-9A-Fa-f]{3,8}\)' = ')'
  ',\#[0-9A-Fa-f]{3,8}\]' = ']'
  'var\(--brand-fg[^)]*\)' = 'var(--brand-text-primary)'
  'var\(--brand-muted[^)]*\)' = 'var(--brand-text-secondary)'
  'border-\[#10B981\]/' = 'border-brand-success/'
  'border-\[#FF2A5F\]/' = 'border-brand-danger/'
  'border-\[#DC2626\]/' = 'border-brand-danger/'
  'border-\[#0D9488\]/' = 'border-brand-secondary/'
  'border-\[#D97706\]/' = 'border-brand-warning/'
  'border-\[#FFB800\]/' = 'border-brand-warning/'
  'bg-\[#10B981\]/' = 'bg-brand-success/'
  'bg-\[#FF2A5F\]/' = 'bg-brand-danger/'
  'bg-\[#DC2626\]/' = 'bg-brand-danger/'
  'bg-\[#0D9488\]/' = 'bg-brand-secondary/'
  'bg-\[#D97706\]/' = 'bg-brand-danger/'
  'bg-\[#1a0508\]' = 'bg-brand-canvas'
  'bg-\[#F4F6F9\]' = 'bg-brand-canvas'
  'text-\[#F8FAFC\]' = 'text-brand-text-primary'
  'text-\[#0F172A\]' = 'text-brand-text-primary'
  'dark:bg-\[#0A0D14\]' = 'dark:bg-brand-canvas'
  'dark:text-\[#F8FAFC\]' = 'dark:text-brand-text-primary'
  'hover:border-\[#10B981\]/' = 'hover:border-brand-success/'
  'fill="#10B981"' = 'fill="var(--brand-success)"'
  'stroke="#10B981"' = 'stroke="var(--brand-success)"'
  'fill="#FF2A5F"' = 'fill="var(--brand-danger)"'
  'stroke="#FF2A5F"' = 'stroke="var(--brand-danger)"'
  'fill="#64748B"' = 'fill="var(--brand-chart-muted)"'
  'fill="#FFB800"' = 'fill="var(--brand-warning)"'
  'stroke="#FFB800"' = 'stroke="var(--brand-warning)"'
  'tick=\{\{ fill: "#94A3B8"' = 'tick={{ fill: "var(--brand-chart-neutral)"'
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
Write-Host "Pass 2 updated $count files"

from pathlib import Path

p = Path(__file__).resolve().parents[1] / "src/app/presidencia/dashboard/page.tsx"
t = p.read_text(encoding="utf-8")

if "BentoPanel" not in t:
    t = t.replace(
        'import { EmptyState, KpiCard, Modal, SlideOver } from "@/components/audit";',
        'import { EmptyState, KpiCard, Modal, SlideOver } from "@/components/audit";\nimport { BentoPanel } from "@/components/nexa/bento-panel";',
    )

replacements = [
    ("text-slate-100", "text-brand-text-primary"),
    ("text-slate-300", "text-brand-text-secondary"),
    ("text-slate-400", "text-brand-text-secondary"),
    ("text-slate-200", "text-brand-text-primary"),
    ("text-emerald-500", "text-brand-success"),
    ("text-amber-500", "text-brand-warning"),
    ("text-amber-400", "text-brand-warning"),
    ("text-amber-100", "text-brand-on-warning"),
    ("text-rose-300", "text-brand-danger"),
    ("border-slate-700", "border-brand-border"),
    (
        "border-amber-500/30 bg-amber-500/10",
        "border-brand-warning/30 bg-brand-warning/10",
    ),
]

for a, b in replacements:
    t = t.replace(a, b)

if "chartTipStyle" not in t:
    insert = """  const chartTipStyle = useMemo(
    () => ({
      borderRadius: 12,
      border: `1px solid ${colors.border}`,
      background: colors.surface,
      color: colors.textPrimary,
      fontSize: 12,
    }),
    [colors],
  );

"""
    t = t.replace(
        "  const [dash, setDash] = useState<Dash | null>(null);",
        insert + "  const [dash, setDash] = useState<Dash | null>(null);",
    )

old_tip = """contentStyle={{
                      background: "var(--brand-surface)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}"""
t = t.replace(old_tip, "contentStyle={chartTipStyle}")

# Main grid bento wrapper
t = t.replace(
    '<div className="relative z-10 grid grid-cols-1 gap-4 lg:grid-cols-2">',
    '<div className="relative z-10 grid grid-cols-1 gap-3 lg:grid-cols-12 lg:gap-4">',
    1,
)

p.write_text(t, encoding="utf-8")
print("presidencia updated")

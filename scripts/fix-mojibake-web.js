const fs = require("fs");
const path = require("path");

const roots = ["apps/web/src", "packages/ui/src", "packages/shared/src", "apps/api/src"];
const EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".css", ".md", ".json"]);

function walk(d, o = []) {
  if (!fs.existsSync(d)) return o;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) {
      if (["node_modules", ".next", "dist", "build"].includes(e.name)) continue;
      walk(f, o);
    } else if (EXT.has(path.extname(e.name))) o.push(f);
  }
  return o;
}

/** Exact leftover sequences found in repo + common Spanish mojibake */
const REPLACEMENTS = [
  // Currency / punctuation (example: $15Â´000)
  ["Â´", "´"],
  ["Â¨", "¨"],
  ["Âª", "ª"],
  ["Âº", "º"],
  ["Â«", "«"],
  ["Â»", "»"],
  ["Â¿", "¿"],
  ["Â¡", "¡"],
  ["Â°", "°"],
  ["Â±", "±"],
  ["Â·", "·"],
  ["Â ", " "],
  ["Â\u00a0", "\u00a0"],

  // Arrows / symbols
  ["â†”", "↔"],
  ["â†’", "→"],
  ["â†", "←"],
  ["â†‘", "↑"],
  ["â†“", "↓"],
  ["âˆ’", "−"],
  ["â€“", "–"],
  ["â€”", "—"],
  ["â€¦", "…"],
  ["â€™", "'"],
  ["â€˜", "'"],
  ["â€œ", "“"],
  ["â€", "”"],
  ["â€¢", "•"],
  ["â˜…", "★"],
  ["â˜†", "☆"],
  ["âœ“", "✓"],
  ["âœ”", "✔"],
  ["âœ•", "✕"],
  ["âœ–", "✖"],
  ["âš ", "⚠"],
  ["âš¡", "⚡"],
  ["â‚¬", "€"],
  ["âŒ˜", "⌘"],
  ["âŒ£", "⌥"],
  ["â‡§", "⇧"],
  ["âŒ¥", "⌃"],

  // Box-drawing comments (broken) → clean ASCII rules
  ["â•", "="],
  ["â•‘", "|"],
  ["â”€", "-"],
  ["â”‚", "|"],
  ["â•”", "+"],
  ["â•—", "+"],
  ["â•š", "+"],
  ["â•", "+"],

  // Latin accents still broken
  ["Ã¡", "á"],
  ["Ã©", "é"],
  ["Ã­", "í"],
  ["Ã³", "ó"],
  ["Ãº", "ú"],
  ["Ã±", "ñ"],
  ["Ã¼", "ü"],
  ["Ã", "Á"],
  ["Ã‰", "É"],
  ["Ã", "Í"],
  ["Ã“", "Ó"],
  ["Ãš", "Ú"],
  ["Ã‘", "Ñ"],
  ["Ãœ", "Ü"],
];

function fixText(input) {
  let text = input;
  for (let g = 0; g < 6; g++) {
    let next = text;
    for (const [bad, good] of REPLACEMENTS) {
      if (next.includes(bad)) next = next.split(bad).join(good);
    }
    // Collapse long ====== comment banners from repeated â• fixes
    next = next.replace(/={8,}/g, "========");
    next = next.replace(/-{8,}/g, "--------");
    if (next === text) break;
    text = next;
  }
  return text;
}

const suspectRe =
  /Ã.|Â.|â.|�|Â´|â€|â†|âœ|âš|â‚¬|âŒ|â˜|âˆ|â•|â”/;

let changed = 0;
const leftovers = [];

for (const root of roots) {
  for (const file of walk(root)) {
    const before = fs.readFileSync(file, "utf8");
    if (!suspectRe.test(before)) continue;
    const after = fixText(before);
    if (after !== before) {
      fs.writeFileSync(file, after, "utf8");
      changed++;
    }
    if (suspectRe.test(after)) {
      const samples = [...after.matchAll(suspectRe)].slice(0, 5).map((m) => {
        const i = m.index ?? 0;
        return JSON.stringify(after.slice(Math.max(0, i - 10), i + 16));
      });
      leftovers.push({ file, samples });
    }
  }
}

console.log("Updated files:", changed);
console.log("Leftover files:", leftovers.length);
for (const L of leftovers) {
  console.log(" -", L.file);
  L.samples.forEach((s) => console.log("   ", s));
}

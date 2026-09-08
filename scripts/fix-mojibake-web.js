const fs = require("fs");
const path = require("path");

const ROOT = path.join("apps", "web", "src");
const EXT = new Set([".ts", ".tsx", ".css", ".js", ".jsx"]);

/** Orden: primero patrones dobles/triples, luego simples */
const REPLACEMENTS = [
  ["Ã¢â‚¬Â¦", "…"],
  ["Ã¢â‚¬â€", "—"],
  ["Ã¢â‚¬â€œ", "–"],
  ["Ã¢â‚¬â„¢", "'"],
  ["Ã¢â‚¬Å“", "“"],
  ["Ã¢â‚¬Â", "”"],
  ["Ã¢â‚¬Â¢", "•"],
  ["ÃƒÂ¡", "á"],
  ["ÃƒÂ©", "é"],
  ["ÃƒÂ­", "í"],
  ["ÃƒÂ³", "ó"],
  ["ÃƒÂº", "ú"],
  ["ÃƒÂ±", "ñ"],
  ["ÃƒÂ¼", "ü"],
  ["ÃƒÂ", "Á"],
  ["Ãƒâ€°", "É"],
  ["ÃƒÂ", "Í"],
  ["Ãƒâ€œ", "Ó"],
  ["ÃƒÅ¡", "Ú"],
  ["Ãƒâ€˜", "Ñ"],
  ["Ã‚Â·", "·"],
  ["Ã‚Â¿", "¿"],
  ["Ã‚Â¡", "¡"],
  ["Ã‚Â", ""],
  ["Ã¢Å“â€œ", "✓"],
  ["Ã¢Å¡Â", "⚠"],
  ["Ã¢â€ â€™", "→"],
  ["â€¦", "…"],
  ["â€”", "—"],
  ["â€“", "–"],
  ["â€™", "'"],
  ["â€˜", "'"],
  ["â€œ", "“"],
  ["â€", "”"],
  ["â€¢", "•"],
  ["â†’", "→"],
  ["â†", "←"],
  ["â†‘", "↑"],
  ["â†“", "↓"],
  ["âœ“", "✓"],
  ["âœ”", "✔"],
  ["âš ", "⚠"],
  ["âš¡", "⚡"],
  ["â‚¬", "€"],
  ["Â·", "·"],
  ["Â¿", "¿"],
  ["Â¡", "¡"],
  ["Â°", "°"],
  ["Â±", "±"],
  ["Â©", "©"],
  ["Â®", "®"],
  ["Â\u00a0", "\u00a0"],
  ["Â ", " "],
  ["Ã¡", "á"],
  ["Ã©", "é"],
  ["Ã­", "í"],
  ["Ã³", "ó"],
  ["Ãº", "ú"],
  ["Ã±", "ñ"],
  ["Ã¼", "ü"],
  ["Ã¶", "ö"],
  ["Ã¤", "ä"],
  ["Ã§", "ç"],
  ["Ã", "Á"],
  ["Ã‰", "É"],
  ["Ã", "Í"],
  ["Ã“", "Ó"],
  ["Ãš", "Ú"],
  ["Ã‘", "Ñ"],
  ["Ãœ", "Ü"],
  ["Ã€", "À"],
  ["Ã¨", "è"],
  ["Ãª", "ê"],
  ["Ã«", "ë"],
  ["Ã®", "î"],
  ["Ã¯", "ï"],
  ["Ã´", "ô"],
  ["Ã»", "û"],
  ["Ã½", "ý"],
];

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".next") continue;
      walk(full, out);
    } else if (EXT.has(path.extname(ent.name))) {
      out.push(full);
    }
  }
  return out;
}

function fixText(input) {
  let text = input;
  for (let guard = 0; guard < 8; guard++) {
    let next = text;
    for (const [bad, good] of REPLACEMENTS) {
      if (next.includes(bad)) next = next.split(bad).join(good);
    }
    if (next === text) break;
    text = next;
  }
  return text;
}

const files = walk(ROOT);
let changed = 0;
const leftovers = [];
for (const file of files) {
  const before = fs.readFileSync(file, "utf8");
  if (!/Ã.|â€|Â[·¿¡ °±©®\u00a0]|Ãƒ|Ã¢/.test(before)) continue;
  const after = fixText(before);
  if (after !== before) {
    fs.writeFileSync(file, after, "utf8");
    changed++;
  }
  const left = (after.match(/Ã.|â€|Â[·¿¡]|Ãƒ|Ã¢/g) || []).length;
  if (left > 0) leftovers.push({ file, left });
}
console.log(`Fixed ${changed} files`);
if (leftovers.length) {
  console.log("Remaining suspects:");
  leftovers
    .sort((a, b) => b.left - a.left)
    .slice(0, 40)
    .forEach((r) => console.log(` ${r.left}\t${r.file}`));
}

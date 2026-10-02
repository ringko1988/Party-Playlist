// Lädt Apps-Script-Dateien (.gs) für Tests in Node.
// Die Dateien laufen im selben Realm wie der Test (Arrays/Dates vergleichbar);
// Google-Dienste wie SpreadsheetApp werden über `globals` als Fakes hineingereicht.
import { readFileSync } from 'node:fs';

export function loadGs(paths, globals = {}) {
  const code = paths.map((p) => readFileSync(p, 'utf8')).join('\n');
  const names = [...code.matchAll(/^function\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  const factory = new Function(...Object.keys(globals), `${code}\nreturn { ${names.join(', ')} };`);
  return factory(...Object.values(globals));
}

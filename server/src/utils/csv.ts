/**
 * Minimal RFC-4180-aware CSV parser (quoted fields, embedded commas/
 * newlines, `""`-escaped quotes, CRLF or LF line endings). Hand-rolled
 * instead of a dependency: `dependencies` is empty for this plugin today,
 * and a naive `split(',')` would silently mis-parse a `to`/`from` value
 * containing a comma (e.g. an old query string like `/old?a=1,2`).
 *
 * Blank lines (no fields, or a single empty field) are dropped, matching
 * common CSV parser behavior for stray newlines between rows.
 */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = input.length;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < len) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (char === "\r") {
      i += 1;
      continue;
    }
    if (char === "\n") {
      pushRow();
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }

  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  return rows.filter((parsedRow) => !(parsedRow.length === 1 && parsedRow[0] === ""));
}

// Reads a CSV export of the tracking sheet into a grid of cells, header row
// first, ready for lib/sheet.ts. RFC 4180 plus what Excel actually writes: a
// UTF-8 BOM, CRLF or bare CR line ends, and semicolons in some regions.

// Quoted fields can hold the separator, line breaks and "" for a quote. Cells
// come back exactly as typed (no trimming), and a line break at the very end
// doesn't add an empty row. A blank line in the middle comes back as [''],
// which tableToRecords skips.
export function parseCsv(text: string, separator = ','): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false // inside "..."
  let fresh = true // nothing read yet for this field
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch !== '"') field += ch
      else if (text[i + 1] === '"') {
        field += '"'
        i++
      } else quoted = false
    } else if (ch === '"' && fresh) {
      quoted = true
      fresh = false
    } else if (ch === separator) {
      row.push(field)
      field = ''
      fresh = true
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      fresh = true
    } else {
      // A stray quote mid-field, or text after a closing quote, is kept as is.
      field += ch
      fresh = false
    }
  }
  // The last row, unless the text already ended on a line break. A quote
  // that never closes keeps everything after it rather than losing the row.
  if (row.length || !fresh) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

// Excel writes commas, semicolons where the decimal mark is a comma, and tabs
// from "Text (Tab delimited)". The header row says which: whichever shows up
// most outside quotes. Commas win a tie. A BOM at the start can't change the
// count, so it's left in.
export function guessSeparator(text: string): string {
  const header = (/^[^\r\n]*/.exec(text)?.[0] ?? '').replace(/"[^"]*"/g, '')
  const count = (sep: string) => header.split(sep).length - 1
  return [';', '\t'].reduce((best, sep) => (count(sep) > count(best) ? sep : best), ',')
}

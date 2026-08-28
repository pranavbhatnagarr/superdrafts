import fs from "node:fs/promises";
import { Workbook } from "@oai/artifact-tool";

const inputPath = "C:/Users/Arul/Downloads/characters_rows (2).csv";
const sqlPath = "../../supabase/power_levels_fill_missing.sql";
const outputPath = "../../outputs/characters_rows_power_completed.csv";
const csvText = await fs.readFile(inputPath, "utf8");
const workbook = await Workbook.fromCSV(csvText, { sheetName: "Characters" });
const sheet = workbook.worksheets.getItem("Characters");
const used = sheet.getUsedRange(true);
const before = used.values.map(row => row.slice());
const headers = before[0].map(String);
const nameCol = headers.indexOf("name");
const powerCol = headers.indexOf("Power_lvl");
if (nameCol < 0 || powerCol < 0) throw new Error("Required columns not found");
const sql = await fs.readFile(sqlPath, "utf8");
const mapping = new Map([...sql.matchAll(/^  \('((?:''|[^'])+)', (\d+)\)/gm)].map(match => [match[1].replaceAll("''", "'"), Number(match[2])]));
let changed = 0;
for (let row = 1; row < before.length; row++) {
  const oldPower = before[row][powerCol];
  if (oldPower !== null && oldPower !== undefined && String(oldPower).trim() !== "") continue;
  const name = String(before[row][nameCol]);
  if (!mapping.has(name)) throw new Error(`No power mapping for ${name}`);
  sheet.getCell(row, powerCol).values = [[mapping.get(name)]];
  changed++;
}
const after = used.values;
for (let row = 1; row < before.length; row++) {
  for (let col = 0; col < before[row].length; col++) {
    const wasBlankPower = col === powerCol && (before[row][col] === null || before[row][col] === undefined || String(before[row][col]).trim() === "");
    if (!wasBlankPower && String(after[row][col] ?? "") !== String(before[row][col] ?? "")) throw new Error(`Unexpected change at row ${row + 1}, column ${col + 1}`);
  }
}
const blanks = after.slice(1).filter(row => row[powerCol] === null || row[powerCol] === undefined || String(row[powerCol]).trim() === "");
if (blanks.length) throw new Error(`${blanks.length} blank power values remain`);
const quote = value => { const text = value === null || value === undefined ? "" : String(value); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
const output = after.map(row => row.map(quote).join(",")).join("\r\n") + "\r\n";
await fs.mkdir("../../outputs", { recursive: true });
await fs.writeFile(outputPath, output, "utf8");
const inspection = await workbook.inspect({ kind: "table", range: `Characters!A1:N${after.length}`, include: "values", tableMaxRows: 5, tableMaxCols: 14, maxChars: 5000 });
console.log(inspection.ndjson);
const preview = await workbook.render({ sheetName: "Characters", range: "A1:N12", scale: 1, format: "png" });
await fs.writeFile("preview.png", new Uint8Array(await preview.arrayBuffer()));
console.log(JSON.stringify({ rows: after.length - 1, changed, blanks: blanks.length, outputPath }));
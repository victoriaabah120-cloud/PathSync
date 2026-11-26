// Spreadsheet files for the class result sheet.
//
// Writes a real .xlsx workbook (Office Open XML in a stored, uncompressed zip)
// so a form teacher can open the sheet in Excel, edit it and send it back, and
// parses the CSV that Excel saves, so importing needs no dependency and no
// round trip through the backend.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function columnName(index) {
  let name = "";
  let n = index + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function sheetXml(rows) {
  const body = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
          if (value === null || value === undefined || value === "") return "";
          if (typeof value === "number" && Number.isFinite(value)) {
            return `<c r="${ref}"><v>${value}</v></c>`;
          }
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function zip(files) {
  const parts = [];
  const central = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const data = file.data;
    const checksum = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0x21, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    const entry = new Uint8Array(46 + nameBytes.length);
    const entryView = new DataView(entry.buffer);
    entryView.setUint32(0, 0x02014b50, true);
    entryView.setUint16(4, 20, true);
    entryView.setUint16(6, 20, true);
    entryView.setUint16(8, 0, true);
    entryView.setUint16(10, 0, true);
    entryView.setUint16(12, 0, true);
    entryView.setUint16(14, 0x21, true);
    entryView.setUint32(16, checksum, true);
    entryView.setUint32(20, data.length, true);
    entryView.setUint32(24, data.length, true);
    entryView.setUint16(28, nameBytes.length, true);
    entryView.setUint32(42, offset, true);
    entry.set(nameBytes, 46);

    parts.push(local, data);
    central.push(entry);
    offset += local.length + data.length;
  });

  const centralSize = central.reduce((total, entry) => total + entry.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, central.length, true);
  endView.setUint16(10, central.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  return new Blob([...parts, ...central, end], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/**
 * Builds an .xlsx workbook from an array of rows (the first row is the header).
 * Strings become inline strings and numbers stay numeric so Excel can total them.
 */
export function buildWorkbook(rows, sheetName = "Class sheet") {
  const safeName = String(sheetName).replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet1";
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(safeName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;

  return zip([
    { name: "[Content_Types].xml", data: encoder.encode(contentTypes) },
    { name: "_rels/.rels", data: encoder.encode(rels) },
    { name: "xl/workbook.xml", data: encoder.encode(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: encoder.encode(workbookRels) },
    { name: "xl/worksheets/sheet1.xml", data: encoder.encode(sheetXml(rows)) },
  ]);
}

function columnIndex(letters) {
  let index = 0;
  for (const character of String(letters).toUpperCase()) {
    const code = character.charCodeAt(0);
    if (code < 65 || code > 90) continue;
    index = index * 26 + (code - 64);
  }
  return index - 1;
}

/**
 * Reads the first worksheet of an .xlsx file into rows of arrays, so a sheet
 * exported from here can be filled in Excel and imported straight back.
 * Handles both stored and deflated entries, inline strings and shared strings.
 */
export async function readWorkbook(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let endOfDirectory = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      endOfDirectory = i;
      break;
    }
  }
  if (endOfDirectory < 0) throw new Error("That file is not a readable .xlsx workbook.");

  const total = view.getUint16(endOfDirectory + 10, true);
  let pointer = view.getUint32(endOfDirectory + 16, true);
  const entries = {};
  for (let i = 0; i < total; i += 1) {
    if (pointer + 46 > bytes.length || view.getUint32(pointer, true) !== 0x02014b50) break;
    const method = view.getUint16(pointer + 10, true);
    const compressedSize = view.getUint32(pointer + 20, true);
    const size = view.getUint32(pointer + 24, true);
    const nameLength = view.getUint16(pointer + 28, true);
    const extraLength = view.getUint16(pointer + 30, true);
    const commentLength = view.getUint16(pointer + 32, true);
    const localOffset = view.getUint32(pointer + 42, true);
    const name = decoder.decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength));
    entries[name] = { method, compressedSize: compressedSize || size, localOffset };
    pointer += 46 + nameLength + extraLength + commentLength;
  }

  async function readEntry(name) {
    const entry = entries[name];
    if (!entry) return "";
    const nameLength = view.getUint16(entry.localOffset + 26, true);
    const extraLength = view.getUint16(entry.localOffset + 28, true);
    const start = entry.localOffset + 30 + nameLength + extraLength;
    const data = bytes.subarray(start, start + entry.compressedSize);
    if (entry.method === 0) return decoder.decode(data);
    if (entry.method !== 8) throw new Error("That workbook uses a compression this browser cannot open.");
    if (typeof DecompressionStream === "undefined") {
      throw new Error("This browser cannot open a compressed .xlsx file. Save it as CSV instead.");
    }
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return decoder.decode(new Uint8Array(await new Response(stream).arrayBuffer()));
  }

  const shared = await readEntry("xl/sharedStrings.xml");
  const sharedStrings = [];
  if (shared) {
    const sharedDoc = new DOMParser().parseFromString(shared, "application/xml");
    Array.from(sharedDoc.getElementsByTagName("si")).forEach((item) => {
      sharedStrings.push(Array.from(item.getElementsByTagName("t")).map((node) => node.textContent).join(""));
    });
  }

  const sheetPath =
    (entries["xl/worksheets/sheet1.xml"] && "xl/worksheets/sheet1.xml") ||
    Object.keys(entries).find((name) => /^xl\/worksheets\/.+\.xml$/.test(name));
  if (!sheetPath) throw new Error("That workbook has no worksheet.");

  const sheetDoc = new DOMParser().parseFromString(await readEntry(sheetPath), "application/xml");
  const rows = [];
  Array.from(sheetDoc.getElementsByTagName("row")).forEach((row) => {
    const cells = [];
    Array.from(row.getElementsByTagName("c")).forEach((cell) => {
      const index = columnIndex(String(cell.getAttribute("r") || "").replace(/[0-9]/g, ""));
      if (index < 0) return;
      const type = cell.getAttribute("t");
      let value = "";
      if (type === "inlineStr") {
        value = Array.from(cell.getElementsByTagName("t")).map((node) => node.textContent).join("");
      } else {
        const node = cell.getElementsByTagName("v")[0];
        const raw = node ? node.textContent : "";
        value = type === "s" ? sharedStrings[Number(raw)] ?? "" : raw;
      }
      cells[index] = value;
    });
    for (let i = 0; i < cells.length; i += 1) if (cells[i] === undefined) cells[i] = "";
    rows.push(cells);
  });
  return rows.filter((row) => row.some((cell) => String(cell).trim() !== ""));
}

/** Reads an uploaded .csv or .xlsx score sheet into rows. */
export async function readSheetFile(file) {
  const name = String(file.name || "").toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) return readWorkbook(file);
  return parseCsv(await readFileAsText(file));
}

/** Saves the rows as a workbook the browser downloads. */
export function downloadWorkbook(filename, rows, sheetName) {
  const blob = buildWorkbook(rows, sheetName);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Parses CSV text (quoted fields, embedded commas and newlines) into rows. */
export function parseCsv(text) {
  const source = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((line) => line.some((cell) => String(cell).trim() !== ""));
}

/** Reads a picked file as text. */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("That file could not be read."));
    reader.readAsText(file);
  });
}

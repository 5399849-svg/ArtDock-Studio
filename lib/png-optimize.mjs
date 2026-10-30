import { inflateSync, deflateSync, constants as zlibConstants } from "node:zlib";
import sharp from "sharp";

const PNG_SIGNATURE = Buffer.from([137,80,78,71,13,10,26,10]);
let crcTable;
function crc32(buffer) {
  if (!crcTable) crcTable = Array.from({ length: 256 }, (_, index) => { let value = index; for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1; return value >>> 0; });
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type, "ascii"); const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0); name.copy(output, 4); data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length); return output;
}
function paeth(a, b, c) { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
function predictor(type, left, up, upperLeft) { if (type === 1) return left; if (type === 2) return up; if (type === 3) return Math.floor((left + up) / 2); if (type === 4) return paeth(left, up, upperLeft); return 0; }
function bytesPerPixel(colorType, bitDepth) { if (bitDepth !== 8) return 0; return ({0:1,2:3,3:1,4:2,6:4})[colorType] || 0; }

export async function optimizePngLosslessly(input) {
  const source = Buffer.from(input);
  if (source.length < 33 || !source.subarray(0, 8).equals(PNG_SIGNATURE)) return source;
  const chunks = []; let offset = 8;
  while (offset + 12 <= source.length) {
    const length = source.readUInt32BE(offset); const type = source.toString("ascii", offset + 4, offset + 8); const data = source.subarray(offset + 8, offset + 8 + length);
    if (offset + 12 + length > source.length) return source;
    chunks.push({ type, data }); offset += 12 + length; if (type === "IEND") break;
  }
  const ihdr = chunks.find((item) => item.type === "IHDR")?.data;
  if (!ihdr) return source;
  const width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4), bitDepth = ihdr[8], colorType = ihdr[9], interlace = ihdr[12];
  const bpp = bytesPerPixel(colorType, bitDepth); if (!bpp || interlace !== 0) return source;
  const stride = width * bpp; const inflated = inflateSync(Buffer.concat(chunks.filter((item) => item.type === "IDAT").map((item) => item.data)));
  if (inflated.length !== height * (stride + 1)) return source;
  const rows = []; let previous = Buffer.alloc(stride); let cursor = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[cursor++]; const encoded = inflated.subarray(cursor, cursor + stride); cursor += stride; const row = Buffer.allocUnsafe(stride);
    for (let x = 0; x < stride; x += 1) { const left = x >= bpp ? row[x - bpp] : 0; const up = previous[x]; const upperLeft = x >= bpp ? previous[x - bpp] : 0; row[x] = (encoded[x] + predictor(filter, left, up, upperLeft)) & 255; }
    rows.push(row); previous = row;
  }
  const filtered = Buffer.allocUnsafe(height * (stride + 1)); cursor = 0; previous = Buffer.alloc(stride);
  for (const row of rows) {
    let bestType = 0, bestBytes = row, bestScore = Infinity;
    for (let type = 0; type <= 4; type += 1) {
      const candidate = Buffer.allocUnsafe(stride); let score = 0;
      for (let x = 0; x < stride; x += 1) { const left = x >= bpp ? row[x - bpp] : 0; const up = previous[x]; const upperLeft = x >= bpp ? previous[x - bpp] : 0; const value = (row[x] - predictor(type, left, up, upperLeft)) & 255; candidate[x] = value; score += Math.min(value, 256 - value); }
      if (score < bestScore) { bestScore = score; bestType = type; bestBytes = candidate; }
    }
    filtered[cursor++] = bestType; bestBytes.copy(filtered, cursor); cursor += stride; previous = row;
  }
  const options = [inflated, filtered].flatMap((payload) => [zlibConstants.Z_DEFAULT_STRATEGY, zlibConstants.Z_FILTERED, zlibConstants.Z_RLE].map((strategy) => deflateSync(payload, { level: 9, strategy })));
  const compressed = options.reduce((best, item) => item.length < best.length ? item : best);
  const rebuilt = [PNG_SIGNATURE]; let inserted = false;
  for (const item of chunks) { if (item.type === "IDAT") { if (!inserted) { rebuilt.push(chunk("IDAT", compressed)); inserted = true; } } else rebuilt.push(chunk(item.type, item.data)); }
  const result = Buffer.concat(rebuilt);
  const sharpResult = await sharp(source).png({ compressionLevel: 9, adaptiveFiltering: true, palette: false, effort: 10 }).toBuffer();
  return [source, result, sharpResult].reduce((best, item) => item.length < best.length ? item : best);
}



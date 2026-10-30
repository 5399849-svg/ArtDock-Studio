// 不依赖第三方库的 zip 写入：逐个文件写入（文件名按 UTF-8），模型和已压缩的文件直接存储，其余用 deflate。
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import zlib from 'node:zlib';

const STORE = /\.(onnx|onnx_data|wasm|whl|zip|png|jpe?g|webp|gif|psd|xlsx|otf|ttf|woff2?)$/i;

function dosTime(date) {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

// entries: [{name: 'a/b.txt', file: '绝对路径'}]
export async function writeZip(output, entries, onEntry = () => {}) {
  const stream = fs.createWriteStream(output);
  const write = buffer => new Promise((resolve, reject) => stream.write(buffer, error => error ? reject(error) : resolve()));
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const data = await fsp.readFile(entry.file);
    const stat = await fsp.stat(entry.file);
    const store = STORE.test(entry.name);
    const body = store ? data : zlib.deflateRawSync(data, {level: 6});
    const crc = zlib.crc32(data);
    const name = Buffer.from(entry.name, 'utf8');
    const {time, date} = dosTime(stat.mtime);
    if (data.length > 0xffffffff || offset > 0xffffffff) throw new Error(`zip 文件超过 4 GB：${entry.name}`);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(store ? 0 : 8, 8); header.writeUInt16LE(time, 10); header.writeUInt16LE(date, 12);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(body.length, 18); header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26); header.writeUInt16LE(0, 28);
    await write(header); await write(name); await write(body);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6); record.writeUInt16LE(0x0800, 8);
    record.writeUInt16LE(store ? 0 : 8, 10); record.writeUInt16LE(time, 12); record.writeUInt16LE(date, 14);
    record.writeUInt32LE(crc, 16); record.writeUInt32LE(body.length, 20); record.writeUInt32LE(data.length, 24);
    record.writeUInt16LE(name.length, 28); record.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([record, name]));
    offset += header.length + name.length + body.length;
    onEntry(entry, data.length);
  }
  const directory = Buffer.concat(central);
  if (central.length > 0xffff) throw new Error('zip 里的文件超过 65535 个');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length, 8); end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  await write(directory); await write(end);
  await new Promise((resolve, reject) => stream.end(error => error ? reject(error) : resolve()));
  return {files: central.length, bytes: offset + directory.length + end.length};
}

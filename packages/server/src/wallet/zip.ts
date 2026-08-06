/**
 * A minimal ZIP writer, because a .pkpass is a zip archive.
 *
 * Hand-rolled rather than pulled from npm: a pass holds five or six small files
 * and needs no compression, no directories, no zip64 and no encryption. The
 * format below is the 1989 original, which every unzip implementation on earth
 * reads.
 *
 * Everything is STORED (method 0), uncompressed. A pass is a few kilobytes of
 * JSON and PNG; deflating it would save nothing and adds a way to be wrong.
 *
 * Verified against Python's `zipfile` in packages/server/src/wallet/wallet.test.mjs,
 * which validates the central directory and CRCs strictly rather than guessing.
 */

import { crc32 } from 'node:zlib';

export interface ZipEntry {
  name: string;
  data: Buffer;
}

/** DOS date/time. Fixed rather than `now` so the same input zips byte-identically. */
const DOS_TIME = 0; // 00:00:00
const DOS_DATE = 0x0021; // 1980-01-01, the epoch the format starts at

export function createZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const crc = crc32(entry.data);
    const size = entry.data.length;

    // --- Local file header (30 bytes + name) ---
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // signature
    local.writeUInt16LE(20, 4); // version needed: 2.0
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method: stored
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18); // compressed
    local.writeUInt32LE(size, 22); // uncompressed
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra field length

    locals.push(local, name, entry.data);

    // --- Central directory entry (46 bytes + name) ---
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); // signature
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0, 8); // flags
    cd.writeUInt16LE(0, 10); // method: stored
    cd.writeUInt16LE(DOS_TIME, 12);
    cd.writeUInt16LE(DOS_DATE, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(size, 20);
    cd.writeUInt32LE(size, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt16LE(0, 30); // extra
    cd.writeUInt16LE(0, 32); // comment
    cd.writeUInt16LE(0, 34); // disk number
    cd.writeUInt16LE(0, 36); // internal attrs
    cd.writeUInt32LE(0, 38); // external attrs
    cd.writeUInt32LE(offset, 42); // offset of local header

    central.push(cd, name);
    offset += 30 + name.length + size;
  }

  const centralBuf = Buffer.concat(central);

  // --- End of central directory (22 bytes) ---
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // this disk
  eocd.writeUInt16LE(0, 6); // disk with central dir
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16); // central dir offset
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...locals, centralBuf, eocd]);
}

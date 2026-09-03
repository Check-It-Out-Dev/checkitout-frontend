/**
 * Minimal STORED-entry ZIP writer for the GDPR showcase's demo export —
 * dependency-free, enough for a handful of small JSON files so the
 * "Download .zip" button delivers literally what it says. Not a general
 * ZIP library: no compression, no zip64, UTF-8 names only.
 */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  readonly name: string;
  readonly content: string;
}

/** Raw archive bytes — the pure core `buildZip` wraps (and specs parse). */
// TS 5.9 lib.dom types Uint8Array generically over its buffer; BlobPart
// requires an ArrayBuffer-backed one, so declare the concrete instantiation.
export function buildZipBytes(files: ReadonlyArray<ZipEntry>): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const name = encoder.encode(f.name);
    const data = encoder.encode(f.content);
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); // local file header signature
    local.setUint16(4, 20, true); // version needed to extract
    local.setUint16(6, 0x0800, true); // general purpose: UTF-8 names
    local.setUint16(8, 0, true); // method: STORED
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true); // compressed size (= raw, STORED)
    local.setUint32(22, data.length, true); // uncompressed size
    local.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(local.buffer), name, data);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); // central directory signature
    cd.setUint16(4, 20, true); // version made by
    cd.setUint16(6, 20, true); // version needed
    cd.setUint16(8, 0x0800, true); // UTF-8 names
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true); // local header offset
    central.push(new Uint8Array(cd.buffer), name);

    offset += 30 + name.length + data.length;
  }

  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); // end-of-central-directory signature
  end.setUint16(8, files.length, true); // entries on this disk
  end.setUint16(10, files.length, true); // entries total
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true); // central directory offset

  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, c) => s + c.length, 0));
  let pos = 0;
  for (const c of all) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

export function buildZip(files: ReadonlyArray<ZipEntry>): Blob {
  return new Blob([buildZipBytes(files)], { type: 'application/zip' });
}

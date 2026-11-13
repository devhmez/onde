import "server-only";
// Minimal streaming ZIP writer (PKZIP 2.0: store or deflate, no ZIP64) — enough for admin downloads of print files.
// Entries are appended one by one, so a route can stream the archive while it renders the next file; only the
// central-directory records (a few dozen bytes per entry) stay in memory.
import { deflateRawSync } from "node:zlib";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** DOS date/time of a wall-clock instant (pass a Date already shifted to the wanted local time, read as UTC). */
function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getUTCFullYear());
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

type Central = { name: Buffer; crc: number; csize: number; usize: number; method: number; offset: number; time: number; date: number };

export class ZipWriter {
  private offset = 0;
  private entries: Central[] = [];
  private names = new Set<string>();
  private readonly stamp: { time: number; date: number };

  /** `localTime`: the wall-clock time to stamp on entries, as a Date whose UTC fields hold that local time. */
  constructor(localTime: Date = new Date()) {
    this.stamp = dosDateTime(localTime);
  }

  get count(): number {
    return this.entries.length;
  }

  /** Bytes of one entry (local header + data). `deflate` for compressible content (text, CSV); PNG/PDF are stored. */
  add(name: string, data: Uint8Array, opts: { deflate?: boolean } = {}): Uint8Array {
    const clean = name.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!clean || clean.split("/").some((p) => p === ".." || p === ".")) throw new Error(`Invalid ZIP entry name: ${name}`);
    if (this.names.has(clean)) throw new Error(`Duplicate ZIP entry: ${clean}`);
    if (this.entries.length >= 0xffff) throw new Error("Too many ZIP entries");
    this.names.add(clean);
    const nameBuf = Buffer.from(clean, "utf8");
    const crc = crc32(data);
    let body: Uint8Array = data;
    let method = 0;
    if (opts.deflate) {
      const z = deflateRawSync(data, { level: 9 });
      if (z.length < data.length) {
        body = z;
        method = 8;
      }
    }
    if (this.offset + 30 + nameBuf.length + body.length > 0xffffffff) throw new Error("ZIP too large");
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4); // version needed: 2.0
    h.writeUInt16LE(0x0800, 6); // UTF-8 names
    h.writeUInt16LE(method, 8);
    h.writeUInt16LE(this.stamp.time, 10);
    h.writeUInt16LE(this.stamp.date, 12);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(body.length, 18);
    h.writeUInt32LE(data.length, 22);
    h.writeUInt16LE(nameBuf.length, 26);
    h.writeUInt16LE(0, 28);
    this.entries.push({ name: nameBuf, crc, csize: body.length, usize: data.length, method, offset: this.offset, ...this.stamp });
    const out = Buffer.concat([h, nameBuf, body]);
    this.offset += out.length;
    return out;
  }

  /** Central directory + end record. Call once, after the last entry. */
  finish(): Uint8Array {
    const parts: Buffer[] = [];
    let size = 0;
    for (const e of this.entries) {
      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50, 0);
      c.writeUInt16LE(20, 4); // made by: 2.0 (MS-DOS attributes)
      c.writeUInt16LE(20, 6);
      c.writeUInt16LE(0x0800, 8);
      c.writeUInt16LE(e.method, 10);
      c.writeUInt16LE(e.time, 12);
      c.writeUInt16LE(e.date, 14);
      c.writeUInt32LE(e.crc, 16);
      c.writeUInt32LE(e.csize, 20);
      c.writeUInt32LE(e.usize, 24);
      c.writeUInt16LE(e.name.length, 28);
      // extra (30), comment (32), disk (34), internal attrs (36), external attrs (38) = 0
      c.writeUInt32LE(e.offset, 42);
      parts.push(c, e.name);
      size += c.length + e.name.length;
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(this.entries.length, 8);
    end.writeUInt16LE(this.entries.length, 10);
    end.writeUInt32LE(size, 12);
    end.writeUInt32LE(this.offset, 16);
    parts.push(end);
    return Buffer.concat(parts);
  }
}

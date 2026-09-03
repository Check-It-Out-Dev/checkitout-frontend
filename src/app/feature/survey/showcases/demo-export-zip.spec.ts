import { buildZipBytes } from './demo-export-zip';

describe('demo-export-zip', () => {
  it('produces a well-formed STORED archive (signatures + EOCD entry count)', () => {
    const b = buildZipBytes([
      { name: 'profile.json', content: '{"a":1}' },
      { name: 'consents.json', content: '{"b":2}' },
    ]);

    // Local file header signature PK\x03\x04 at offset 0.
    expect([b[0], b[1], b[2], b[3]]).toEqual([0x50, 0x4b, 0x03, 0x04]);

    // End-of-central-directory record: last 22 bytes, PK\x05\x06, entry count.
    const eocd = b.slice(b.length - 22);
    expect([eocd[0], eocd[1], eocd[2], eocd[3]]).toEqual([0x50, 0x4b, 0x05, 0x06]);
    const total = eocd[10] | (eocd[11] << 8);
    expect(total).toBe(2);

    // Entry names + contents are embedded verbatim (STORED, no compression).
    const text = new TextDecoder().decode(b);
    expect(text).toContain('profile.json');
    expect(text).toContain('consents.json');
    expect(text).toContain('{"a":1}');
  });

  it('writes matching sizes into the local header (STORED: compressed = raw)', () => {
    const content = 'x'.repeat(97);
    const b = buildZipBytes([{ name: 'f.txt', content }]);
    const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
    expect(view.getUint32(18, true)).toBe(97); // compressed size
    expect(view.getUint32(22, true)).toBe(97); // uncompressed size
    expect(view.getUint16(26, true)).toBe(5); // name length
  });

  it('anchors central-directory offsets so multi-file archives stay consistent', () => {
    const b = buildZipBytes([
      { name: 'a.json', content: '{}' },
      { name: 'b.json', content: '{"x":true}' },
    ]);
    // Second local header must sit exactly after the first entry:
    // 30 (header) + 6 (name "a.json") + 2 (content "{}").
    const second = 30 + 6 + 2;
    expect([b[second], b[second + 1], b[second + 2], b[second + 3]]).toEqual([
      0x50, 0x4b, 0x03, 0x04,
    ]);
  });
});

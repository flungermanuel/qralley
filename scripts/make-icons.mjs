// Generates simple placeholder PNG icons (no dependencies). Replace with real artwork later.
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const BG = [0x1f, 0x6f, 0x5c];
const FG = [0xff, 0xff, 0xff];

const crcTable = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});
const crc32 = (buf) => {
	let c = 0xffffffff;
	for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
	const body = Buffer.concat([Buffer.from(type), data]);
	const out = Buffer.alloc(body.length + 8);
	out.writeUInt32BE(data.length, 0);
	body.copy(out, 4);
	out.writeUInt32BE(crc32(body), body.length + 4);
	return out;
};

/** Square icon: background colour with a white ring. `safe` shrinks the ring for maskable icons. */
function png(size, safe) {
	const raw = Buffer.alloc((size * 3 + 1) * size);
	const c = size / 2;
	const outer = size * (safe ? 0.28 : 0.38);
	const inner = outer * 0.62;
	for (let y = 0; y < size; y++) {
		raw[y * (size * 3 + 1)] = 0;
		for (let x = 0; x < size; x++) {
			const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
			const [r, g, b] = d <= outer && d >= inner ? FG : BG;
			const i = y * (size * 3 + 1) + 1 + x * 3;
			raw[i] = r;
			raw[i + 1] = g;
			raw[i + 2] = b;
		}
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 2; // RGB
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", ihdr),
		chunk("IDAT", deflateSync(raw)),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

const dir = new URL("../apps/web/public/icons/", import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL("icon-192.png", dir), png(192, false));
writeFileSync(new URL("icon-512.png", dir), png(512, false));
writeFileSync(new URL("icon-maskable-512.png", dir), png(512, true));
console.log("icons written to apps/web/public/icons");

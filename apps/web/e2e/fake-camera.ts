import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createQrMatrix } from "../../api/src/domain/qr-codes";

/**
 * Writes a Y4M video (a few identical frames) that shows one QR code on white.
 * Chromium loops it as a fake camera (--use-file-for-fake-video-capture).
 */
export function writeQrVideo(file: string, text: string): void {
	const width = 640;
	const height = 480;
	const modules = createQrMatrix(text, "M");
	const quiet = 4;
	const cells = modules.size + quiet * 2;
	const cell = Math.floor(Math.min(width, height) / cells);
	const offsetX = Math.floor((width - cells * cell) / 2);
	const offsetY = Math.floor((height - cells * cell) / 2);

	const luma = Buffer.alloc(width * height, 255);
	for (let row = 0; row < modules.size; row++) {
		for (let col = 0; col < modules.size; col++) {
			if (!modules.get(row, col)) continue;
			const x0 = offsetX + (col + quiet) * cell;
			const y0 = offsetY + (row + quiet) * cell;
			for (let y = y0; y < y0 + cell; y++)
				luma.fill(0, y * width + x0, y * width + x0 + cell);
		}
	}
	const chroma = Buffer.alloc((width / 2) * (height / 2), 128);
	const frame = Buffer.concat([Buffer.from("FRAME\n"), luma, chroma, chroma]);

	const header = Buffer.from(
		`YUV4MPEG2 W${width} H${height} F10:1 Ip A1:1 C420jpeg\n`,
	);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(
		file,
		Buffer.concat([header, ...Array.from({ length: 10 }, () => frame)]),
	);
}

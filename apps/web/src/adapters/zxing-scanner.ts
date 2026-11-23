import { ScannerError, type ScannerPort } from "../ports/scanner";

const SCAN_INTERVAL_MS = 200;
const MAX_FRAME_WIDTH = 640;

type ZxingReader = typeof import("zxing-wasm/reader");
let zxing: Promise<ZxingReader> | null = null;

/** Loads the decoder lazily; the WASM file is served from our own origin (precached by the service worker). */
function loadZxing(): Promise<ZxingReader> {
	zxing ??= (async () => {
		const [reader, wasm] = await Promise.all([
			import("zxing-wasm/reader"),
			import("zxing-wasm/reader/zxing_reader.wasm?url"),
		]);
		reader.prepareZXingModule({
			overrides: {
				locateFile: (path: string, prefix: string) =>
					path.endsWith(".wasm") ? wasm.default : prefix + path,
			},
		});
		return reader;
	})();
	return zxing;
}

function toScannerError(err: unknown): ScannerError {
	const name = err instanceof DOMException ? err.name : "";
	if (name === "NotAllowedError" || name === "SecurityError")
		return new ScannerError("permission_denied");
	if (name === "NotFoundError" || name === "OverconstrainedError")
		return new ScannerError("no_camera");
	return new ScannerError(
		"failed",
		err instanceof Error ? err.message : undefined,
	);
}

export function createZxingScanner(): ScannerPort {
	let stream: MediaStream | null = null;
	let timer: number | undefined;
	// Incremented by every start/stop; a start that finds a newer value was cancelled.
	let session = 0;

	const release = () => {
		window.clearInterval(timer);
		timer = undefined;
		for (const track of stream?.getTracks() ?? []) track.stop();
		stream = null;
	};

	return {
		async start(video, onDecode) {
			const mine = ++session;
			if (!navigator.mediaDevices?.getUserMedia) {
				throw new ScannerError("failed", "Camera API not available");
			}

			let media: MediaStream;
			try {
				media = await navigator.mediaDevices.getUserMedia({
					video: { facingMode: { ideal: "environment" } },
					audio: false,
				});
			} catch (err) {
				throw toScannerError(err);
			}
			if (mine !== session) {
				for (const track of media.getTracks()) track.stop();
				return;
			}
			stream = media;

			video.srcObject = media;
			video.muted = true;
			video.setAttribute("playsinline", "true");
			try {
				await video.play();
			} catch (err) {
				release();
				throw toScannerError(err);
			}

			const { readBarcodes } = await loadZxing();
			if (mine !== session) return;

			const canvas = document.createElement("canvas");
			const ctx = canvas.getContext("2d", { willReadFrequently: true });
			if (!ctx) throw new ScannerError("failed", "Canvas not available");

			let busy = false;
			timer = window.setInterval(async () => {
				if (busy || mine !== session || video.videoWidth === 0) return;
				busy = true;
				try {
					const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth);
					canvas.width = Math.round(video.videoWidth * scale);
					canvas.height = Math.round(video.videoHeight * scale);
					ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
					const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
					const [hit] = await readBarcodes(frame, {
						formats: ["QRCode"],
						maxNumberOfSymbols: 1,
						tryHarder: true,
					});
					if (hit?.isValid && mine === session) onDecode(hit.text);
				} catch {
					// A single bad frame is not an error; try the next one.
				} finally {
					busy = false;
				}
			}, SCAN_INTERVAL_MS);
		},

		stop() {
			session++;
			release();
		},
	};
}

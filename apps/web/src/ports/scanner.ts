export type ScannerFailure = "permission_denied" | "no_camera" | "failed";

export class ScannerError extends Error {
	readonly reason: ScannerFailure;

	constructor(reason: ScannerFailure, message?: string) {
		super(message ?? reason);
		this.name = "ScannerError";
		this.reason = reason;
	}
}

/**
 * Camera + QR decoding behind a small interface, so the UI can be tested with a
 * fake and the decoder library (currently zxing-wasm) can be swapped.
 */
export interface ScannerPort {
	/** Starts the camera in `video` and calls `onDecode` for every decoded QR text. Rejects with ScannerError. */
	start(
		video: HTMLVideoElement,
		onDecode: (text: string) => void,
	): Promise<void>;
	/** Stops decoding and releases the camera. Safe to call repeatedly. */
	stop(): void;
}

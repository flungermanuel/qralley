export interface GeoPosition {
	lat: number;
	lng: number;
	/** Horizontal accuracy in meters. */
	accuracyM: number;
}

export type GeolocationFailure =
	| "permission_denied"
	| "unavailable"
	| "timeout";

export class GeolocationError extends Error {
	readonly reason: GeolocationFailure;

	constructor(reason: GeolocationFailure, message?: string) {
		super(message ?? reason);
		this.name = "GeolocationError";
		this.reason = reason;
	}
}

/** One-shot position lookup, used only for the fallback check-in. Rejects with GeolocationError. */
export interface GeolocationPort {
	getPosition(): Promise<GeoPosition>;
}

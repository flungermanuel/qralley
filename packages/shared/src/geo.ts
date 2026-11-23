export interface LatLng {
	lat: number;
	lng: number;
}

const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Worst GPS accuracy (meters) still accepted for the fallback check-in. */
export const MAX_FALLBACK_ACCURACY_M = 50;

export interface Position extends LatLng {
	accuracyM: number;
}

export type FallbackPositionResult =
	| { ok: true }
	| { ok: false; reason: "too_far" | "accuracy_too_low" };

/** Fallback check-in: precise enough first (player can retry), then within radius. */
export function checkFallbackPosition(
	station: LatLng,
	radiusM: number,
	position: Position,
): FallbackPositionResult {
	const { lat, lng, accuracyM } = position;
	if (![lat, lng, accuracyM].every(Number.isFinite) || accuracyM < 0) {
		return { ok: false, reason: "accuracy_too_low" };
	}
	if (accuracyM > MAX_FALLBACK_ACCURACY_M)
		return { ok: false, reason: "accuracy_too_low" };
	return distanceM(station, { lat, lng }) <= radiusM
		? { ok: true }
		: { ok: false, reason: "too_far" };
}

/** Great-circle distance in meters (haversine). */
export function distanceM(a: LatLng, b: LatLng): number {
	const dLat = toRad(b.lat - a.lat);
	const dLng = toRad(b.lng - a.lng);
	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
	return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

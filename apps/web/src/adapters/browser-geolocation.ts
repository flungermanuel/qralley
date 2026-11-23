import {
	GeolocationError,
	type GeolocationPort,
	type GeoPosition,
} from "../ports/geolocation";

const TIMEOUT_MS = 15_000;

/** Asks the browser for a single fresh, high-accuracy position. Nothing is watched or kept. */
export function createBrowserGeolocation(): GeolocationPort {
	return {
		getPosition: () =>
			new Promise<GeoPosition>((resolve, reject) => {
				if (!navigator.geolocation) {
					reject(
						new GeolocationError(
							"unavailable",
							"Geolocation API not available",
						),
					);
					return;
				}
				navigator.geolocation.getCurrentPosition(
					(p) =>
						resolve({
							lat: p.coords.latitude,
							lng: p.coords.longitude,
							accuracyM: p.coords.accuracy,
						}),
					(err) =>
						reject(
							new GeolocationError(
								err.code === err.PERMISSION_DENIED
									? "permission_denied"
									: err.code === err.TIMEOUT
										? "timeout"
										: "unavailable",
							),
						),
					{ enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: 0 },
				);
			}),
	};
}

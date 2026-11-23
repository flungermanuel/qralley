import type { Route } from "@qurally/shared";
import QRCode from "qrcode";
import { type SigningKeys, signToken } from "./token";

export interface QrJob {
	stationId: string;
	title: string;
	url: string;
}

function normalizeBaseUrl(baseUrl: string): string {
	let url: URL;
	try {
		url = new URL(baseUrl);
	} catch {
		throw new Error(`Invalid base URL: ${baseUrl}`);
	}
	const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
	if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
		throw new Error(
			"Base URL must use https (http is only allowed for localhost)",
		);
	}
	return url.origin;
}

/** One signed QR URL per station of the route. */
export function buildQrJobs(
	route: Route,
	baseUrl: string,
	keys: SigningKeys,
): QrJob[] {
	const origin = normalizeBaseUrl(baseUrl);
	return route.stations.map((station) => {
		const token = signToken(keys, {
			routeId: route.id,
			stationId: station.id,
			keyVersion: station.qrKeyVersion,
		});
		return {
			stationId: station.id,
			title: station.title,
			url: `${origin}/q/${token}`,
		};
	});
}

const XML_ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};
const escapeXml = (s: string) =>
	s.replace(/[&<>"']/g, (c) => XML_ESCAPES[c] ?? c);

const QUIET_ZONE = 4;
const CAPTION_HEIGHT = 7;

/** Printable SVG: QR code (error correction Q) with a caption below. */
export function renderQrSvg(url: string, caption: string): string {
	const { modules } = QRCode.create(url, { errorCorrectionLevel: "Q" });
	const size = modules.size;
	const total = size + QUIET_ZONE * 2;

	let path = "";
	for (let row = 0; row < size; row++) {
		let col = 0;
		while (col < size) {
			if (!modules.get(row, col)) {
				col++;
				continue;
			}
			const start = col;
			while (col < size && modules.get(row, col)) col++;
			path += `M${start + QUIET_ZONE},${row + QUIET_ZONE}h${col - start}v1h-${col - start}z`;
		}
	}

	return [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total + CAPTION_HEIGHT}" width="60mm" shape-rendering="crispEdges">`,
		`<rect width="${total}" height="${total + CAPTION_HEIGHT}" fill="#fff"/>`,
		`<path d="${path}" fill="#000"/>`,
		`<text x="${total / 2}" y="${total + 3.5}" text-anchor="middle" font-family="sans-serif" font-size="3" fill="#000">${escapeXml(caption)}</text>`,
		"</svg>",
	].join("\n");
}

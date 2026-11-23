/** All user-facing German texts in one place. */
export const texts = {
	appTitle: "qurally",
	loading: "Lädt …",
	safety: {
		title: "Bevor es losgeht",
		items: [
			"Achte immer auf den Verkehr. Überquere Straßen nur an sicheren Stellen.",
			"Schau nicht beim Gehen aufs Handy. Bleib zum Scannen und Lesen stehen.",
			"Besuche nur öffentlich zugängliche Orte. Keine Abkürzungen über Privatgrund oder Absperrungen.",
			"Es gibt keinen Zeitdruck. Lass eine Station aus, wenn dir etwas unsicher vorkommt, und melde sie.",
		],
		confirm: "Verstanden",
	},
	route: {
		notLoaded: "Route noch nicht geladen – bitte einmal mit Internet öffnen.",
		offlineCached: "Offline – zuletzt geladene Route",
		installTip:
			"Tipp: Füge die App zum Startbildschirm hinzu, damit dein Fortschritt zuverlässig gespeichert bleibt.",
	},
	status: {
		blocked: "Gesperrt",
		blockedHint: "Diese Station ist aktuell nicht spielbar.",
		reported: "Gemeldet",
		reportedHint:
			"Der Code ist möglicherweise beschädigt. Ein Ersatzweg steht bereit.",
	},
	update: {
		message: "Neue Version verfügbar",
		reload: "Neu laden",
	},
} as const;

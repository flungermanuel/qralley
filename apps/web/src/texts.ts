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
	station: {
		back: "Zurück zur Liste",
		stateVisited: "Besucht",
		stateCompleted: "Abgeschlossen",
		found: (xp: number) => `Station gefunden! +${xp} XP (vorläufig)`,
		completed: "Station abgeschlossen",
	},
	scan: {
		open: "Station scannen",
		title: "Code scannen",
		walkingWarning: "Nicht beim Gehen aufs Handy schauen.",
		starting: "Kamera startet …",
		cancel: "Abbrechen",
		toList: "Zur Stationsliste",
		foreign: "Das ist kein qurally-Code.",
		wrongRoute: "Dieser Code gehört zu einer anderen Route.",
		invalidCode: "Dieser Code ist nicht (mehr) gültig.",
		blocked: "Diese Station ist gesperrt.",
		alreadyVisited: "Diese Station hast du schon besucht.",
		permissionDenied:
			"Die Kamera ist nicht erlaubt. Erlaube den Kamerazugriff in den Browser-Einstellungen und versuche es erneut.",
		noCamera: "Es wurde keine Kamera gefunden.",
		failed: "Die Kamera konnte nicht gestartet werden.",
	},
	quest: {
		check: "Antwort prüfen",
		answerLabel: "Deine Antwort",
		wrong: "Leider falsch. Versuch es noch einmal.",
		correct: (xp: number) => `Richtig! +${xp} XP (vorläufig)`,
	},
	xp: {
		summary: (xp: number, provisional: boolean) =>
			`${xp} XP${provisional ? " (vorläufig)" : ""}`,
	},
	sync: {
		pending: (n: number) =>
			n === 1
				? "1 Eintrag wartet auf Synchronisierung"
				: `${n} Einträge warten auf Synchronisierung`,
		now: "Jetzt synchronisieren",
		running: "Synchronisiere …",
		failed:
			"Synchronisierung fehlgeschlagen. Wir versuchen es automatisch erneut.",
		dismiss: "Ausblenden",
		unknownStation: "Eine Station",
		issue: (station: string, reason: string) => `${station}: ${reason}`,
		reasonUnknown: "Der Server hat den Eintrag nicht akzeptiert.",
		reasons: {
			malformed: "Der Eintrag war ungültig.",
			invalid_token: "Der Code konnte nicht bestätigt werden.",
			unknown_key: "Dieser Code ist nicht mehr gültig.",
			wrong_route: "Der Code gehört zu einer anderen Route.",
			unknown_route: "Diese Route gibt es nicht mehr.",
			unknown_station: "Diese Station gibt es nicht mehr.",
			station_blocked: "Die Station wurde inzwischen gesperrt.",
			not_visited: "Die Station war noch nicht bestätigt.",
			answer_incorrect: "Die Antwort wurde nicht akzeptiert.",
			too_far: "Du warst zu weit von der Station entfernt.",
			accuracy_too_low: "Der Standort war zu ungenau.",
			fallback_disabled: "Für diese Station gibt es keinen Ersatzweg.",
			rate_limited: "Zu viele Meldungen in kurzer Zeit.",
		},
	},
	update: {
		message: "Neue Version verfügbar",
		reload: "Neu laden",
	},
} as const;

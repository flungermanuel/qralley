import type { Quest, RouteBundle, Station } from "@qurally/shared";
import { liveQuery } from "dexie";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { createZxingScanner } from "./adapters/zxing-scanner";
import type { LocalProgress, Profile, QurallyDb } from "./data/db";
import { acknowledgeSafety, getOrCreateProfile } from "./data/profile";
import { answerQuest, summarizeProgress } from "./data/quest";
import { type LoadResult, loadRoute } from "./data/route";
import { processScan, type ScanOutcome } from "./data/scan";
import {
	ScannerError,
	type ScannerFailure,
	type ScannerPort,
} from "./ports/scanner";
import { texts } from "./texts";

/** The mini version has exactly one route. */
export const ROUTE_ID = import.meta.env.VITE_ROUTE_ID ?? "innsbruck-altstadt";

export interface AppProps {
	db: QurallyDb;
	fetchFn?: typeof fetch;
	updateAvailable: boolean;
	onUpdate: () => void;
	createScanner?: () => ScannerPort;
	/** Text of a code that opened the app (system camera -> /q/<token>). Defaults to the current URL. */
	initialScanText?: string | null;
}

/** The full URL when the app was opened through a QR code, otherwise null. */
function deepLinkText(): string | null {
	return window.location.pathname.startsWith("/q/")
		? window.location.href
		: null;
}

export function App({
	db,
	fetchFn,
	updateAvailable,
	onUpdate,
	createScanner = createZxingScanner,
	initialScanText,
}: AppProps) {
	const [profile, setProfile] = useState<Profile | null>(null);
	const [pendingScan, setPendingScan] = useState<string | null>(
		() => initialScanText ?? deepLinkText(),
	);

	useEffect(() => {
		let active = true;
		getOrCreateProfile(db).then((p) => active && setProfile(p));
		return () => {
			active = false;
		};
	}, [db]);

	const acknowledge = useCallback(async () => {
		await acknowledgeSafety(db);
		setProfile(await getOrCreateProfile(db));
		// Ask the browser not to evict our data under storage pressure.
		void navigator.storage?.persist?.();
	}, [db]);

	const consumeScan = useCallback(() => {
		setPendingScan(null);
		if (window.location.pathname.startsWith("/q/"))
			window.history.replaceState(null, "", "/");
	}, []);

	return (
		<div className="app">
			<header>
				<h1>{texts.appTitle}</h1>
			</header>
			{updateAvailable && <UpdateBanner onUpdate={onUpdate} />}
			<main>
				{!profile ? (
					<p>{texts.loading}</p>
				) : !profile.safetyAcknowledgedAt ? (
					<SafetyNotice onConfirm={acknowledge} />
				) : (
					<RouteView
						db={db}
						fetchFn={fetchFn}
						createScanner={createScanner}
						pendingScan={pendingScan}
						onScanConsumed={consumeScan}
					/>
				)}
			</main>
		</div>
	);
}

function UpdateBanner({ onUpdate }: { onUpdate: () => void }) {
	// The user decides when to reload, so an open quest is never interrupted.
	return (
		<div className="banner" role="status">
			<span>{texts.update.message}</span>{" "}
			<button type="button" onClick={onUpdate}>
				{texts.update.reload}
			</button>
		</div>
	);
}

function SafetyNotice({ onConfirm }: { onConfirm: () => void }) {
	return (
		<section>
			<h2>{texts.safety.title}</h2>
			<ul>
				{texts.safety.items.map((item) => (
					<li key={item}>{item}</li>
				))}
			</ul>
			<button type="button" onClick={onConfirm}>
				{texts.safety.confirm}
			</button>
		</section>
	);
}

type View =
	| { kind: "list" }
	| { kind: "scan" }
	| { kind: "station"; stationId: string; notice?: string };

function scanMessage(outcome: ScanOutcome): string {
	switch (outcome.kind) {
		case "foreign":
			return texts.scan.foreign;
		case "wrong_route":
			return texts.scan.wrongRoute;
		case "invalid_code":
			return texts.scan.invalidCode;
		case "blocked":
			return texts.scan.blocked;
		case "visited":
			return texts.station.found(outcome.xp);
		case "duplicate":
			return texts.scan.alreadyVisited;
	}
}

function useProgress(db: QurallyDb, routeId: string): LocalProgress[] {
	const [rows, setRows] = useState<LocalProgress[]>([]);
	useEffect(() => {
		const subscription = liveQuery(() =>
			db.progress.filter((r) => r.routeId === routeId).toArray(),
		).subscribe({
			next: setRows,
			error: () => {},
		});
		return () => subscription.unsubscribe();
	}, [db, routeId]);
	return rows;
}

interface RouteViewProps {
	db: QurallyDb;
	fetchFn?: typeof fetch;
	createScanner: () => ScannerPort;
	pendingScan: string | null;
	onScanConsumed: () => void;
}

function RouteView({
	db,
	fetchFn,
	createScanner,
	pendingScan,
	onScanConsumed,
}: RouteViewProps) {
	const [result, setResult] = useState<LoadResult | null>(null);
	const [view, setView] = useState<View>({ kind: "list" });
	const [notice, setNotice] = useState<string | null>(null);
	const rows = useProgress(db, ROUTE_ID);

	useEffect(() => {
		let active = true;
		const refresh = () => {
			loadRoute(db, ROUTE_ID, fetchFn).then((r) => active && setResult(r));
		};
		refresh();
		const onVisible = () => document.visibilityState === "visible" && refresh();
		window.addEventListener("online", refresh);
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			active = false;
			window.removeEventListener("online", refresh);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, [db, fetchFn]);

	const bundle = result?.bundle ?? null;

	const handleOutcome = useCallback((outcome: ScanOutcome) => {
		if (outcome.kind === "visited" || outcome.kind === "duplicate") {
			setView({
				kind: "station",
				stationId: outcome.stationId,
				notice: scanMessage(outcome),
			});
		} else {
			setNotice(scanMessage(outcome));
			setView({ kind: "list" });
		}
	}, []);

	// A code that opened the app is handled once the route is available.
	const handledLink = useRef(false);
	useEffect(() => {
		if (!bundle || !pendingScan || handledLink.current) return;
		handledLink.current = true;
		processScan(db, bundle, pendingScan).then((outcome) => {
			handleOutcome(outcome);
			onScanConsumed();
		});
	}, [bundle, pendingScan, db, handleOutcome, onScanConsumed]);

	if (!result) return <p>{texts.loading}</p>;
	if (!bundle) return <p>{texts.route.notLoaded}</p>;

	const summary = summarizeProgress(bundle, rows);
	const goToList = () => {
		setNotice(null);
		setView({ kind: "list" });
	};

	return (
		<>
			{result.status === "cached" && (
				<p className="offline">{texts.route.offlineCached}</p>
			)}
			<p className="xp">{texts.xp.summary(summary.xp, summary.provisional)}</p>

			{view.kind === "scan" && (
				<ScanScreen
					createScanner={createScanner}
					process={(text) => processScan(db, bundle, text)}
					onOutcome={handleOutcome}
					onCancel={goToList}
				/>
			)}

			{view.kind === "station" && (
				<StationView
					db={db}
					bundle={bundle}
					stationId={view.stationId}
					rows={rows}
					notice={view.notice}
					onBack={goToList}
				/>
			)}

			{view.kind === "list" && (
				<>
					{notice && <p role="alert">{notice}</p>}
					<button type="button" onClick={() => setView({ kind: "scan" })}>
						{texts.scan.open}
					</button>
					<StationList
						bundle={bundle}
						rows={rows}
						onOpen={(stationId) => {
							setNotice(null);
							setView({ kind: "station", stationId });
						}}
					/>
					<p className="tip">{texts.route.installTip}</p>
				</>
			)}
		</>
	);
}

interface ScanScreenProps {
	createScanner: () => ScannerPort;
	process: (text: string) => Promise<ScanOutcome>;
	onOutcome: (outcome: ScanOutcome) => void;
	onCancel: () => void;
}

const FAILURE_TEXT: Record<ScannerFailure, string> = {
	permission_denied: texts.scan.permissionDenied,
	no_camera: texts.scan.noCamera,
	failed: texts.scan.failed,
};

function ScanScreen({
	createScanner,
	process,
	onOutcome,
	onCancel,
}: ScanScreenProps) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [failure, setFailure] = useState<ScannerFailure | null>(null);
	// Latest callbacks without restarting the camera on every render.
	const latest = useRef({ createScanner, process, onOutcome });
	latest.current = { createScanner, process, onOutcome };

	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;
		const scanner = latest.current.createScanner();
		let active = true;
		let last: { text: string; at: number } | null = null;

		scanner
			.start(video, (text) => {
				if (!active) return;
				const now = Date.now();
				// The decoder reports the same code on every frame; handle it once per moment.
				if (last && last.text === text && now - last.at < 2000) return;
				last = { text, at: now };
				void latest.current.process(text).then((outcome) => {
					if (!active) return;
					if (outcome.kind === "visited" || outcome.kind === "duplicate") {
						active = false;
						scanner.stop();
						latest.current.onOutcome(outcome);
					} else {
						setMessage(scanMessage(outcome));
					}
				});
			})
			.catch((err: unknown) => {
				if (active)
					setFailure(err instanceof ScannerError ? err.reason : "failed");
			});

		return () => {
			active = false;
			scanner.stop();
		};
	}, []);

	return (
		<section>
			<h2>{texts.scan.title}</h2>
			<p>{texts.scan.walkingWarning}</p>
			{failure ? (
				<>
					<p role="alert">{FAILURE_TEXT[failure]}</p>
					<button type="button" onClick={onCancel}>
						{texts.scan.toList}
					</button>
				</>
			) : (
				<>
					{/* biome-ignore lint/a11y/useMediaCaption: live camera preview has no audio */}
					<video ref={videoRef} className="preview" playsInline muted />
					{message && <p role="alert">{message}</p>}
				</>
			)}
			<button type="button" onClick={onCancel}>
				{texts.scan.cancel}
			</button>
		</section>
	);
}

function StationList({
	bundle,
	rows,
	onOpen,
}: {
	bundle: RouteBundle;
	rows: LocalProgress[];
	onOpen: (stationId: string) => void;
}) {
	const { route, stationStates } = bundle;
	return (
		<section>
			<h2>{route.title}</h2>
			<p>{route.description}</p>
			<ul className="stations">
				{route.stations.map((station) => {
					const status = stationStates[station.id]?.status ?? "ok";
					const progress = rows.find((r) => r.stationId === station.id);
					return (
						<li key={station.id} className={`station station--${status}`}>
							<button
								type="button"
								className="station-open"
								onClick={() => onOpen(station.id)}
							>
								<span className="station-title">{station.title}</span>
								{progress && (
									<span className="chip">
										{progress.state === "completed"
											? texts.station.stateCompleted
											: texts.station.stateVisited}
									</span>
								)}
							</button>
							<StatusNote status={status} />
							<p>{station.hint}</p>
						</li>
					);
				})}
			</ul>
		</section>
	);
}

function StatusNote({
	status,
}: {
	status: "ok" | "reported" | "blocked";
}): ReactNode {
	if (status === "blocked") {
		return (
			<>
				<strong>{texts.status.blocked}</strong>
				<p>{texts.status.blockedHint}</p>
			</>
		);
	}
	if (status === "reported") {
		return (
			<>
				<strong>{texts.status.reported}</strong>
				<p>{texts.status.reportedHint}</p>
			</>
		);
	}
	return null;
}

interface StationViewProps {
	db: QurallyDb;
	bundle: RouteBundle;
	stationId: string;
	rows: LocalProgress[];
	notice?: string;
	onBack: () => void;
}

function StationView({
	db,
	bundle,
	stationId,
	rows,
	notice,
	onBack,
}: StationViewProps) {
	const [feedback, setFeedback] = useState<string | null>(null);
	const station = bundle.route.stations.find((s) => s.id === stationId);
	if (!station) return null;

	const status = bundle.stationStates[station.id]?.status ?? "ok";
	const progress = rows.find((r) => r.stationId === station.id);
	const playable = status !== "blocked";

	const submit = async (answer: string) => {
		const result = await answerQuest(db, bundle, station.id, answer);
		if (result.status === "correct")
			setFeedback(texts.quest.correct(result.xp));
		else if (result.status === "incorrect") setFeedback(texts.quest.wrong);
	};

	return (
		<section>
			<button type="button" onClick={onBack}>
				{texts.station.back}
			</button>
			<h2>{station.title}</h2>
			{notice && <p role="status">{notice}</p>}
			<StatusNote status={status} />
			<p>{station.hint}</p>
			<p className="safety-note">{station.safetyNote}</p>

			{playable && progress?.state === "visited" && (
				<QuestForm key={station.id} quest={station.quest} onSubmit={submit} />
			)}
			{feedback && <p role="status">{feedback}</p>}
			{playable && progress?.state === "completed" && (
				<>
					<p>
						<strong>{texts.station.completed}</strong>
					</p>
					{station.quest.explanation && <p>{station.quest.explanation}</p>}
				</>
			)}
		</section>
	);
}

function QuestForm({
	quest,
	onSubmit,
}: {
	quest: Quest;
	onSubmit: (answer: string) => void;
}) {
	const [answer, setAnswer] = useState("");
	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				onSubmit(answer);
			}}
		>
			{quest.type === "choice" ? (
				<fieldset>
					<legend>{quest.prompt}</legend>
					{quest.options.map((option) => (
						<label key={option.id} className="option">
							<input
								type="radio"
								name="answer"
								value={option.id}
								checked={answer === option.id}
								onChange={() => setAnswer(option.id)}
							/>
							{option.label}
						</label>
					))}
				</fieldset>
			) : (
				<>
					<p>{quest.prompt}</p>
					<label>
						{texts.quest.answerLabel}
						<input
							type="text"
							value={answer}
							onChange={(e) => setAnswer(e.target.value)}
							autoComplete="off"
						/>
					</label>
				</>
			)}
			<button type="submit" disabled={answer.trim() === ""}>
				{texts.quest.check}
			</button>
		</form>
	);
}

export type { Station };

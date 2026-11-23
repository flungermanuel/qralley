import type { RouteBundle } from "@qurally/shared";
import { useCallback, useEffect, useState } from "react";
import type { Profile, QurallyDb } from "./data/db";
import { acknowledgeSafety, getOrCreateProfile } from "./data/profile";
import { type LoadResult, loadRoute } from "./data/route";
import { texts } from "./texts";

/** The mini version has exactly one route. */
export const ROUTE_ID = import.meta.env.VITE_ROUTE_ID ?? "innsbruck-altstadt";

export interface AppProps {
	db: QurallyDb;
	fetchFn?: typeof fetch;
	updateAvailable: boolean;
	onUpdate: () => void;
}

export function App({ db, fetchFn, updateAvailable, onUpdate }: AppProps) {
	const [profile, setProfile] = useState<Profile | null>(null);

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
					<RouteView db={db} fetchFn={fetchFn} />
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

function RouteView({ db, fetchFn }: { db: QurallyDb; fetchFn?: typeof fetch }) {
	const [result, setResult] = useState<LoadResult | null>(null);

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

	if (!result) return <p>{texts.loading}</p>;
	if (!result.bundle) return <p>{texts.route.notLoaded}</p>;

	return (
		<>
			{result.status === "cached" && (
				<p className="offline">{texts.route.offlineCached}</p>
			)}
			<StationList bundle={result.bundle} />
			<p className="tip">{texts.route.installTip}</p>
		</>
	);
}

function StationList({ bundle }: { bundle: RouteBundle }) {
	const { route, stationStates } = bundle;
	return (
		<section>
			<h2>{route.title}</h2>
			<p>{route.description}</p>
			<ul className="stations">
				{route.stations.map((station) => {
					const status = stationStates[station.id]?.status ?? "ok";
					return (
						<li key={station.id} className={`station station--${status}`}>
							<h3>{station.title}</h3>
							{status === "blocked" && (
								<>
									<strong>{texts.status.blocked}</strong>
									<p>{texts.status.blockedHint}</p>
								</>
							)}
							{status === "reported" && (
								<>
									<strong>{texts.status.reported}</strong>
									<p>{texts.status.reportedHint}</p>
								</>
							)}
							<p>{station.hint}</p>
						</li>
					);
				})}
			</ul>
		</section>
	);
}

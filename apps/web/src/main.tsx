import { useRegisterSW } from "virtual:pwa-register/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { QurallyDb } from "./data/db";
import "./styles.css";

const db = new QurallyDb();

function Root() {
	const {
		needRefresh: [needRefresh],
		updateServiceWorker,
	} = useRegisterSW();
	return (
		<App
			db={db}
			updateAvailable={needRefresh}
			onUpdate={() => void updateServiceWorker(true)}
		/>
	);
}

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");
createRoot(container).render(
	<StrictMode>
		<Root />
	</StrictMode>,
);

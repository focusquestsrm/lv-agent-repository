import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { APP_LOGO_ALT, APP_LOGO_URL, APP_NAME } from "./brand";
import "./styles.css";
import "./admin-actions.css";

class ApplicationErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, details) {
    console.error("The Hub application render failed", error, details);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="fatal-error" role="alert">
        <img src={APP_LOGO_URL} alt={APP_LOGO_ALT} />
        <small>{APP_NAME}</small>
        <h1>We couldn’t load your workspace.</h1>
        <p>Your account and saved resources are unchanged. Reload once to retry.</p>
        <button onClick={() => window.location.reload()}>Reload The Hub</button>
        <details>
          <summary>Technical details</summary>
          <code>{this.state.error?.message || "Unknown application error"}</code>
        </details>
      </main>
    );
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ApplicationErrorBoundary><App /></ApplicationErrorBoundary>
  </React.StrictMode>,
);

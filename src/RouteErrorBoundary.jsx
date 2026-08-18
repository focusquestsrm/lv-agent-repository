import { Component } from "react";
import { safeDataError } from "./resourceVisibility";

export default class RouteErrorBoundary extends Component {
  state = { error: null, resetCount: 0 };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("The Hub route render failed", error, info);
  }

  componentDidUpdate(previousProps) {
    if (previousProps.routeKey !== this.props.routeKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  async retry() {
    await this.props.onRetry?.();
    this.setState((current) => ({ error: null, resetCount: current.resetCount + 1 }));
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="route-error" role="alert">
        <small>PAGE UNAVAILABLE</small>
        <h1>{this.props.title || "This page could not be displayed"}</h1>
        <p>The rest of The Hub is still available. Retry this page or return to the Dashboard.</p>
        <details>
          <summary>Technical details</summary>
          <code>{`${this.state.error.name || "Error"}: ${safeDataError(this.state.error)}`}</code>
        </details>
        <div>
          <button className="primary" onClick={() => this.retry()}>Retry</button>
          <button onClick={this.props.onBack}>Return to Dashboard</button>
        </div>
      </section>
    );
  }
}

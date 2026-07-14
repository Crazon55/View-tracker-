import { Component, type ReactNode } from "react";

// Catches page crashes and shows the actual error instead of a blank screen.
export class DebugBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error, info: unknown) { console.error("DebugBoundary caught:", err, info); }

  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 40, color: "#f4f4f7", fontFamily: "'JetBrains Mono', monospace", background: "#0a0a0d", minHeight: "70vh" }}>
          <h2 style={{ color: "#f87171", fontSize: 18, marginBottom: 12 }}>⚠ This page crashed — {this.state.err.name}</h2>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "#ecc06a", marginBottom: 16 }}>{this.state.err.message}</pre>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 10.5, color: "#8a8a94", maxHeight: 340, overflow: "auto", lineHeight: 1.5 }}>{this.state.err.stack}</pre>
          <button onClick={() => this.setState({ err: null })} style={{ marginTop: 18, padding: "9px 16px", background: "#8b5cf6", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

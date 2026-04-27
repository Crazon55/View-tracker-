import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  title?: string;
};

type State = { error?: Error };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Visible in console for quick debugging in production.
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error);
  }

  render() {
    const err = this.state.error;
    if (!err) return this.props.children;

    return (
      <div className="min-h-screen bg-zinc-950 pt-24 pb-16 px-6 flex items-center justify-center">
        <div className="w-full max-w-xl rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-6 backdrop-blur-xl">
          <p className="text-sm font-black text-red-200">{this.props.title ?? "Something broke"}</p>
          <p className="text-xs text-zinc-400 mt-2 break-words">{err.message || String(err)}</p>
          <p className="text-[11px] text-zinc-500 mt-4">
            Reload the page. If it persists, copy the first Console error line and send it here.
          </p>
        </div>
      </div>
    );
  }
}


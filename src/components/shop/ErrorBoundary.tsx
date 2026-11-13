"use client";
// Keeps a WebGL / dynamic-import failure local: render the still fallback instead of breaking the page.
import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { fallback: ReactNode; children: ReactNode; onError?: (error: Error) => void };
type State = { failed: boolean };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error);
    if (process.env.NODE_ENV !== "production") console.warn("[shop] 3D section failed, showing fallback", error, info);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

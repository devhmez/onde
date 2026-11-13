"use client";

import { Component, type ReactNode } from "react";

/** Swallows WebGL/context/model errors so a failed canvas degrades to its poster or fallback instead of a crash. */
export class CanvasBoundary extends Component<{ onError?: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError?.();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";
import { GarageMessage } from "./GarageMessage";

// three.js needs the browser (WebGL); keep it out of the server render and the main bundle.
const GarageCanvas = dynamic(() => import("./GarageCanvas"), {
  ssr: false,
  loading: () => <GarageMessage>Preparing the garage…</GarageMessage>,
});

class SceneErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Garage scene failed", error);
  }

  render() {
    if (this.state.failed) {
      return <GarageMessage>The 3D garage needs WebGL, which this browser could not start.</GarageMessage>;
    }
    return this.props.children;
  }
}

/**
 * Full-bleed 3D layer behind the page chrome. Fixed to the viewport, so it always
 * fills the window whatever the size of the page box.
 */
export function GarageScene() {
  return (
    <div className="fixed inset-0 -z-10 h-dvh w-screen">
      <SceneErrorBoundary>
        <GarageCanvas />
      </SceneErrorBoundary>
    </div>
  );
}

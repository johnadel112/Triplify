"use client";
import { StatusPanel } from "@/components/status-panel";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="container page-space">
      <StatusPanel
        tone="error"
        title="We hit some turbulence"
        message="This page could not be loaded. Try again, and review the latest status before repeating an action."
        action={
          <button className="button button-small" onClick={reset}>
            Try again
          </button>
        }
      />
    </div>
  );
}

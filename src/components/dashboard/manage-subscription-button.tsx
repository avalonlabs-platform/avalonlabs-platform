"use client";

import { useState } from "react";
import { createPortalSession } from "@/actions/portal";

export function ManageSubscriptionButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    const result = await createPortalSession();
    if ("error" in result) {
      setError(
        result.error === "No Paddle customer"
          ? "No billing account found yet — subscribe to a plan first."
          : "Couldn't open billing portal. Please try again."
      );
      setLoading(false);
      return;
    }
    window.location.href = result.url;
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white/90 transition-colors hover:bg-white/5 disabled:opacity-50"
      >
        {loading ? "Opening…" : "Manage billing"}
      </button>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}

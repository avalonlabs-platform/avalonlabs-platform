"use client";

import { useEffect, useState } from "react";

interface ApiKey {
  id: string;
  label: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  revoked: "bg-white/10 text-white/40 ring-white/20",
};

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ApiKeysManager() {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [confirmingRevokeId, setConfirmingRevokeId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function loadKeys() {
    try {
      const response = await fetch("/api/account/api-keys");
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Unable to load API keys");
        return;
      }
      setKeys(data.keys);
      setError(null);
    } catch {
      setError("Unable to load API keys");
    }
  }

  useEffect(() => {
    loadKeys();
  }, []);

  function openCreateModal() {
    setLabel("");
    setCreateError(null);
    setRevealedKey(null);
    setCopied(false);
    setShowCreate(true);
  }

  function closeCreateModal() {
    setShowCreate(false);
    setLabel("");
    setCreateError(null);
    setRevealedKey(null);
    setCopied(false);
  }

  async function handleCreate() {
    setCreating(true);
    setCreateError(null);
    try {
      const response = await fetch("/api/account/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() || undefined }),
      });
      const data = await response.json();
      if (!response.ok) {
        setCreateError(data.error ?? "Unable to create API key");
        setCreating(false);
        return;
      }
      setRevealedKey(data.key);
      await loadKeys();
    } catch {
      setCreateError("Unable to create API key");
    } finally {
      setCreating(false);
    }
  }

  async function handleCopy() {
    if (!revealedKey) return;
    try {
      await navigator.clipboard.writeText(revealedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — user can still select/copy manually.
    }
  }

  async function handleRevoke(id: string) {
    setRevokingId(id);
    try {
      const response = await fetch(`/api/account/api-keys/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Unable to revoke API key");
        setRevokingId(null);
        return;
      }
      setConfirmingRevokeId(null);
      await loadKeys();
    } catch {
      setError("Unable to revoke API key");
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium tracking-wide text-white/40 uppercase">API keys</p>
        <button
          type="button"
          onClick={openCreateModal}
          className="rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-3 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90"
        >
          Generate new key
        </button>
      </div>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      {keys === null && !error && (
        <div className="mt-4 h-16 animate-pulse rounded-xl bg-white/[0.03]" />
      )}

      {keys !== null && keys.length === 0 && (
        <p className="mt-3 text-sm text-white/50">
          No API keys yet. Generate one to use the Chrome extension or call the API directly.
        </p>
      )}

      {keys !== null && keys.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3">
          {keys.map((key) => {
            const isRevoked = Boolean(key.revoked_at);
            const statusStyle = isRevoked ? STATUS_STYLES.revoked : STATUS_STYLES.active;
            return (
              <li
                key={key.id}
                className="rounded-xl border border-white/10 bg-white/[0.02] p-3"
              >
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-white">{key.label}</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${statusStyle}`}>
                    {isRevoked ? "revoked" : "active"}
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs text-white/40">{key.key_prefix}…</p>
                <p className="mt-1 text-xs text-white/40">
                  Created {formatDate(key.created_at)} · Last used {formatDate(key.last_used_at)}
                </p>

                {!isRevoked && (
                  <div className="mt-2">
                    {confirmingRevokeId === key.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white/60">Revoke this key?</span>
                        <button
                          type="button"
                          onClick={() => handleRevoke(key.id)}
                          disabled={revokingId === key.id}
                          className="rounded-full bg-red-500/20 px-3 py-1 text-xs font-medium text-red-300 ring-1 ring-red-500/30 transition-colors hover:bg-red-500/30 disabled:opacity-50"
                        >
                          {revokingId === key.id ? "Revoking…" : "Confirm revoke"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingRevokeId(null)}
                          disabled={revokingId === key.id}
                          className="rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-white/90 transition-colors hover:bg-white/5 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingRevokeId(key.id)}
                        className="rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-white/90 transition-colors hover:bg-white/5"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#161b22] p-5">
            {!revealedKey ? (
              <>
                <p className="text-sm font-semibold text-white">Generate new API key</p>
                <p className="mt-1 text-xs text-white/50">
                  Give it a label so you can recognize it later (e.g. &quot;Chrome Extension&quot;).
                </p>
                <input
                  type="text"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="Chrome Extension"
                  maxLength={100}
                  className="mt-3 w-full rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-indigo-500/50 focus:outline-none"
                />
                {createError && <p className="mt-2 text-xs text-red-400">{createError}</p>}
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeCreateModal}
                    disabled={creating}
                    className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white/90 transition-colors hover:bg-white/5 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={creating}
                    className="rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {creating ? "Generating…" : "Generate"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-white">Your new API key</p>
                <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                  <p className="text-xs text-amber-300">
                    Copy this key now — you won&apos;t be able to see it again. If you lose it,
                    revoke it and generate a new one.
                  </p>
                </div>
                <p className="mt-3 break-all rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-xs text-white">
                  {revealedKey}
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white/90 transition-colors hover:bg-white/5"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                  <button
                    type="button"
                    onClick={closeCreateModal}
                    className="rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

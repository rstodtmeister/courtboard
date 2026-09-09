import React, { useRef, useState } from "react";
import { QrCode } from "../QrCode";

export function AppDialog({
  title,
  message,
  secondaryLabel,
  primaryLabel,
  onSecondary,
  onPrimary,
  onClose,
}: {
  title: string;
  message: string;
  secondaryLabel: string;
  primaryLabel: string;
  onSecondary: () => void;
  onPrimary: () => void;
  onClose: () => void;
}) {
  return (
    <div className="app-dialog-backdrop" role="presentation">
      <section className="app-dialog" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title">
        <h3 id="app-dialog-title">{title}</h3>
        <div className="app-dialog-message">
          {message.split("\n").map((line, index) => <p key={`${index}-${line}`}>{line}</p>)}
        </div>
        <div className="app-dialog-actions">
          <button type="button" className="secondary" onClick={onSecondary}>{secondaryLabel}</button>
          <button type="button" onClick={onPrimary}>{primaryLabel}</button>
        </div>
        <button type="button" className="app-dialog-close" onClick={onClose} aria-label="Dialog schließen">×</button>
      </section>
    </div>
  );
}

export function LinkOutput({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function copy() {
    if (await copyText(value, inputRef.current)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  }

  return (
    <div className="link-output-wrap">
      <div className="link-output">
        <input ref={inputRef} value={value} readOnly />
        <button type="button" onClick={copy}>{copied ? "Kopiert" : "Kopieren"}</button>
      </div>
      <QrCode value={value} />
    </div>
  );
}

export function CompactLink({ value, hideQr = false, mobileCompact = false }: { value: string; hideQr?: boolean; mobileCompact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function copy() {
    if (await copyText(value, inputRef.current)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    }
  }

  return (
    <div className={hideQr ? "token-link-cell no-qr" : "token-link-cell"}>
      <div className={mobileCompact ? "compact-link mobile-compact-link" : "compact-link"}>
        <input ref={inputRef} value={value} readOnly />
        <button type="button" className="secondary" onClick={copy}>{copied ? "Kopiert" : mobileCompact ? "Link kopieren" : "Kopieren"}</button>
      </div>
      {!hideQr && <QrCode value={value} compact />}
    </div>
  );
}

async function copyText(value: string, input: HTMLInputElement | null) {
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall back to selecting the field below. LAN dev URLs are often not secure contexts.
  }

  if (!input) {
    return false;
  }

  input.focus();
  input.select();
  input.setSelectionRange(0, value.length);

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  }
}

export function scoreUrl(token: string, baseUrl?: string | null) {
  const url = new URL(baseUrl && baseUrl.trim() ? baseUrl.trim() : window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("token", token);
  return url.toString();
}

export function loginUrl() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function displayUrl(tournamentId?: string, orientation: "normal" | "landscape" = "normal") {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("view", "courts");
  if (tournamentId) {
    url.searchParams.set("tournamentId", tournamentId);
  }
  if (orientation === "landscape") {
    url.searchParams.set("orientation", "landscape");
  }
  return url.toString();
}

export function formatSyncTime(date: Date) {
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { CourtLinksPanel } from "../../src/admin/CourtLinksPanel";
import "../../src/styles.css";

function Fixture() {
  const [courtStreams, setCourtStreams] = useState<Record<string, string>>({});
  const [savedValues, setSavedValues] = useState<string[]>([]);

  async function saveCourtStream(court: string, value: string) {
    await new Promise((resolve) => window.setTimeout(resolve, 100));
    setSavedValues((current) => [...current, value]);
    setCourtStreams((current) => {
      const next = { ...current };
      if (value) next[court] = value;
      else delete next[court];
      return next;
    });
  }

  return (
    <main style={{ maxWidth: 720, padding: 16 }}>
      <CourtLinksPanel
        courts={[{ court: "1", tournamentId: "tournament-1" }]}
        games={[]}
        links={[]}
        courtLocks={[]}
        tournamentId="tournament-1"
        onCreateCourtLink={async () => null}
        onReplaceCourtLink={async () => undefined}
        onUnlockCourt={async () => undefined}
        courtStreams={courtStreams}
        onSaveCourtStream={saveCourtStream}
      />
      <output aria-label="Gespeicherte Streamwerte">{JSON.stringify(savedValues)}</output>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);

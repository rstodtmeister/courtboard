// Tournament bracket labels are not selectable team identities.
export function isSelectableTeam(value: string | null | undefined): boolean {
  const name = value?.trim() ?? '';
  if (!name || /^(?:[-–—?]+|\(?freilos\)?|tbd|offen|team\s+[ab]\s+offen)$/i.test(name)) return false;
  if (/^(?:pool|gruppe)\s+[a-z0-9]+\s*[-.:]?\s*\d+\.?$/i.test(name)) return false;
  if (/^\d+\.?\s*(?:platz\s*)?(?:pool|gruppe)\s+[a-z0-9]+$/i.test(name)) return false;
  if (/^(?:gewinner|verlierer|sieger|winner|loser)(?:\s*[-:#.]?\s*(?:(?:aus|von|des)\s+)?(?:spiel|match|pool|gruppe)\b.*|\s*[-:#.]?\s*\d+\.?)?$/i.test(name)) return false;
  return true;
}

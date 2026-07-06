import { PDFDocument } from "pdf-lib";
import type { Game } from "./types";

export type PdfSheetType = "normal" | "easy";

const normalTemplateUrl = `${import.meta.env.BASE_URL}pdf-templates/spielberichtsbogen_Formular.pdf`;
const easyTemplateUrl = `${import.meta.env.BASE_URL}pdf-templates/spielberichtsbogen_Formular_easy05.pdf`;

export async function writeScoreSheetPdf(games: Game[], sheetType: PdfSheetType) {
  if (games.length === 0) {
    throw new Error("Keine Spiele fuer den PDF-Druck ausgewaehlt.");
  }

  const pdfBytes = sheetType === "easy"
    ? await createEasyPdf(games)
    : await createNormalPdf(games);
  downloadPdf(pdfBytes, suggestedOutputFileName(games));
}

async function createNormalPdf(games: Game[]) {
  const templateBytes = await fetchTemplate(normalTemplateUrl);
  const mergedDocument = await PDFDocument.create();

  for (const game of games) {
    const document = await PDFDocument.load(templateBytes);
    const form = document.getForm();
    setField(form, "Nr", game.number);
    setField(form, "Datum", game.game_date);
    setField(form, "Feld Nr", game.court);
    setField(form, "Schiri", game.referee);

    const teamAPlayers = splitTeam(game.team_a);
    setField(form, "Team A Spieler 1", teamAPlayers[0]);
    setField(form, "Team A Spieler 2", teamAPlayers[1]);

    const teamBPlayers = splitTeam(game.team_b);
    setField(form, "Team B Spieler 1", teamBPlayers[0]);
    setField(form, "Team B Spieler 2", teamBPlayers[1]);

    form.flatten();
    const pages = await mergedDocument.copyPages(document, document.getPageIndices());
    pages.forEach((page) => mergedDocument.addPage(page));
  }

  return mergedDocument.save();
}

async function createEasyPdf(games: Game[]) {
  const templateBytes = await fetchTemplate(easyTemplateUrl);
  const mergedDocument = await PDFDocument.create();

  for (let index = 0; index < games.length; index += 2) {
    const document = await PDFDocument.load(templateBytes);
    const form = document.getForm();
    fillPrefixedFields(form, "F1_", games[index]);
    if (games[index + 1]) {
      fillPrefixedFields(form, "F2_", games[index + 1]);
    }
    form.flatten();
    const pages = await mergedDocument.copyPages(document, document.getPageIndices());
    pages.forEach((page) => mergedDocument.addPage(page));
  }

  return mergedDocument.save();
}

function fillPrefixedFields(form: ReturnType<PDFDocument["getForm"]>, prefix: string, game: Game) {
  setField(form, `${prefix}Nr`, game.number);
  setField(form, `${prefix}Datum`, game.game_date);
  setField(form, `${prefix}Feld Nr`, game.court);
  setField(form, `${prefix}Schiri`, game.referee);

  const teamAPlayers = splitTeam(game.team_a);
  setField(form, `${prefix}Team A Spieler 1`, teamAPlayers[0]);
  setField(form, `${prefix}Team A Spieler 2`, teamAPlayers[1]);

  const teamBPlayers = splitTeam(game.team_b);
  setField(form, `${prefix}Team B Spieler 1`, teamBPlayers[0]);
  setField(form, `${prefix}Team B Spieler 2`, teamBPlayers[1]);
}

function setField(form: ReturnType<PDFDocument["getForm"]>, fieldName: string, value: string | null | undefined) {
  try {
    const field = form.getTextField(fieldName);
    field.setText(value ?? "");
  } catch {
    // Template variants may omit individual fields; keep the remaining PDF export usable.
  }
}

async function fetchTemplate(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`PDF-Vorlage konnte nicht geladen werden: ${url}`);
  }
  return response.arrayBuffer();
}

function downloadPdf(pdfBytes: Uint8Array, fileName: string) {
  const arrayBuffer = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function splitTeam(team: string | null | undefined): [string, string] {
  const cleanedTeam = stripSeed(team);
  const players = cleanedTeam.split(/\s+-\s+/, 2);
  return [players[0] ?? "", players[1] ?? ""];
}

function stripSeed(value: string | null | undefined) {
  return value ? value.replace(/\s*\([^)]*\)\s*$/, "").trim() : "";
}

function suggestedOutputFileName(games: Game[]) {
  const parts = games.map((game, index) => sanitizeFilePart(game.number || String(index + 1)));
  return `Spiel_${parts.join("_")}.pdf`;
}

function sanitizeFilePart(value: string) {
  const sanitized = value.replace(/[^A-Za-z0-9._-]+/g, "_");
  return sanitized || "Spiel";
}

export const gameRatingOptions = [
  "",
  "Normal",
  "Freilos B",
  "Freilos A",
  "Verletzung A",
  "Verletzung B",
  "Verletzung A + B",
  "Aufgabe A",
  "Aufgabe B",
  "Aufgabe A + B",
  "nicht angetreten A",
  "nicht angetreten B",
  "nicht angetreten A + B",
  "Verletzung A + Nichtangetreten B",
  "Nichtangetreten A + Verletzung B",
];

export const specialGameRatingOptions = gameRatingOptions.filter((option) => option && option !== "Normal");
export const noRefereeSelection = "__no_referee__";

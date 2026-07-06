import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrCode({ value, compact = false }: { value: string; compact?: boolean }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let cancelled = false;

    QRCode.toDataURL(value, {
      errorCorrectionLevel: "M",
      margin: 1,
      scale: compact ? 3 : 6,
      color: {
        dark: "#111827",
        light: "#ffffff",
      },
    })
      .then((nextSrc) => {
        if (!cancelled) {
          setSrc(nextSrc);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSrc("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [compact, value]);

  if (!src) {
    return <div className={compact ? "qr-code compact loading" : "qr-code loading"} aria-label="QR-Code wird erzeugt" />;
  }

  return (
    <img
      className={compact ? "qr-code compact" : "qr-code"}
      src={src}
      alt="QR-Code fuer Ergebnislink"
    />
  );
}

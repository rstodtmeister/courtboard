# Packaging

Die Pakete werden mit `jpackage` gebaut. Das erzeugte Paket enthält eine eigene Java-Runtime; Anwender müssen kein JDK installieren.

## Voraussetzungen

- JDK 17 oder neuer mit `jpackage`
- Maven
- macOS-Pakete auf macOS bauen
- Windows-MSI auf Windows bauen
- Für `--type msi` benötigt `jpackage` auf Windows eine installierte WiX Toolset-Version, die vom verwendeten JDK unterstützt wird.

## macOS

Standardmäßig wird ein `.app`-Image gebaut:

```bash
scripts/package-macos.sh
```

Ergebnis:

```text
target/package/CourtBoard.app
```

Optional kann ein DMG versucht werden:

```bash
scripts/package-macos.sh dmg
```

Falls `hdiutil` beim DMG-Build auf dem lokalen System Probleme macht, bleibt das `.app`-Image der zuverlässige Build-Pfad.

## Windows

Auf Windows in PowerShell ausführen:

```powershell
.\scripts\package-windows.ps1
```

Ergebnis:

```text
target\package\CourtBoard-1.0.0.msi
```

Der MSI-Installer legt optional Startmenüeintrag und Desktop-Verknüpfung an.

## Icon

Das Icon zeigt Volleyball und Schiedsrichterpfeife. Die Quelle liegt unter:

```text
packaging/icon/courtboard-icon.svg
packaging/tools/IconGenerator.java
```

Die plattformspezifischen Icon-Dateien werden durch die Packaging-Skripte erzeugt:

```text
packaging/icon/CourtBoard.icns
packaging/icon/CourtBoard.ico
```

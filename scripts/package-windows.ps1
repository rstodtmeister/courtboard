$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$AppName = "CourtBoard"
$MainJar = "CourtBoard-1.0-SNAPSHOT.jar"
$MainClass = "org.example.Main"
$PackageDir = Join-Path $RootDir "target\package"
$InputDir = Join-Path $RootDir "target\jpackage-input"
$IconDir = Join-Path $RootDir "target\package-icons\windows"
$IconFile = Join-Path $RootDir "packaging\icon\CourtBoard.ico"
$IconGeneratorDir = Join-Path $RootDir "target\icon-generator"

Set-Location $RootDir
mvn package

Remove-Item $PackageDir, $InputDir, $IconDir, $IconGeneratorDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $PackageDir, $InputDir, $IconDir, $IconGeneratorDir, (Split-Path $IconFile) | Out-Null
Copy-Item (Join-Path $RootDir "target\$MainJar") (Join-Path $InputDir $MainJar)

javac -d $IconGeneratorDir (Join-Path $RootDir "packaging\tools\IconGenerator.java")
java -Djava.awt.headless=true -cp $IconGeneratorDir IconGenerator $IconFile --ico

jpackage `
  --type msi `
  --name $AppName `
  --app-version "1.0.0" `
  --input $InputDir `
  --main-jar $MainJar `
  --main-class $MainClass `
  --dest $PackageDir `
  --icon $IconFile `
  --win-menu `
  --win-shortcut

Write-Host "Windows-Installer erzeugt in: $PackageDir"

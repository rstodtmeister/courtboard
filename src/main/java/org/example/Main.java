package org.example;

import javax.swing.SwingUtilities;
import java.nio.file.Path;

public class Main {
    public static void main(String[] args) {
        if (args.length >= 1 && "--api".equals(args[0])) {
            int port = args.length >= 2 ? Integer.parseInt(args[1]) : 8787;
            try {
                new LocalApiServer(port).start();
            } catch (Exception exception) {
                System.err.println("Fehler beim Start der lokalen API: " + exception.getMessage());
                System.exit(3);
            }
            return;
        }

        if (args.length == 0) {
            SwingUtilities.invokeLater(() -> new ApplicationWindow().setVisible(true));
            return;
        }

        if (args.length != 2 && args.length != 4) {
            printUsage();
            System.exit(1);
        }

        String url = args[0];
        Path outputFile = Path.of(args[1]);
        String username = args.length == 4 ? args[2] : "";
        String password = args.length == 4 ? args[3] : "";

        try {
            new PdfGenerator().generate(url, outputFile, username, password);

            System.out.println("PDF wurde erzeugt: " + outputFile.toAbsolutePath());
        } catch (Exception exception) {
            System.err.println("Fehler beim Erzeugen der PDF-Datei: " + exception.getMessage());
            System.exit(2);
        }
    }

    private static void printUsage() {
        System.out.println("Verwendung:");
        System.out.println("  mvn exec:java -Dexec.args=\"<url> <ausgabe.pdf>\"");
        System.out.println("  mvn exec:java -Dexec.args=\"<url> <ausgabe.pdf> <benutzer> <passwort>\"");
        System.out.println("  java -jar target/CourtBoard-1.0-SNAPSHOT.jar");
        System.out.println("  java -jar target/CourtBoard-1.0-SNAPSHOT.jar \"<url>\" \"<ausgabe.pdf>\"");
        System.out.println("  java -jar target/CourtBoard-1.0-SNAPSHOT.jar \"<url>\" \"<ausgabe.pdf>\" \"<benutzer>\" \"<passwort>\"");
        System.out.println("  mvn exec:java -Dexec.args=\"--api 8787\"");
        System.out.println("  java -jar target/CourtBoard-1.0-SNAPSHOT.jar --api 8787");
        System.out.println();
        System.out.println("Beispiel:");
        System.out.println("  mvn exec:java -Dexec.args=\"https://example.org ziel.pdf\"");
    }
}

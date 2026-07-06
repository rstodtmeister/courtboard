import javax.imageio.ImageIO;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.Shape;
import java.awt.geom.AffineTransform;
import java.awt.geom.Area;
import java.awt.geom.Ellipse2D;
import java.awt.geom.Path2D;
import java.awt.geom.RoundRectangle2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

public class IconGenerator {
    private static final int[] ICO_SIZES = {16, 24, 32, 48, 64, 128, 256};
    private static final int[] ICNS_SIZES = {16, 32, 64, 128, 256, 512, 1024};
    private static final String[] ICNS_TYPES = {"icp4", "icp5", "icp6", "ic07", "ic08", "ic09", "ic10"};

    public static void main(String[] args) throws Exception {
        if (args.length < 2) {
            System.err.println("Usage: IconGenerator <png-dir|ico-file> <size|--ico>");
            System.exit(1);
        }

        Path output = Path.of(args[0]);
        if ("--ico".equals(args[1])) {
            writeIco(output);
            return;
        }
        if ("--icns".equals(args[1])) {
            writeIcns(output);
            return;
        }

        int size = Integer.parseInt(args[1]);
        Files.createDirectories(output);
        ImageIO.write(render(size), "png", output.resolve("icon_" + size + "x" + size + ".png").toFile());
    }

    private static void writeIco(Path outputFile) throws IOException {
        Path parent = outputFile.toAbsolutePath().getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }

        List<byte[]> images = new ArrayList<>();
        for (int size : ICO_SIZES) {
            ByteArrayOutputStream png = new ByteArrayOutputStream();
            ImageIO.write(render(size), "png", png);
            images.add(png.toByteArray());
        }

        try (OutputStream out = Files.newOutputStream(outputFile);
             DataOutputStream data = new DataOutputStream(out)) {
            writeShortLE(data, 0);
            writeShortLE(data, 1);
            writeShortLE(data, images.size());

            int offset = 6 + images.size() * 16;
            for (int index = 0; index < ICO_SIZES.length; index++) {
                int size = ICO_SIZES[index];
                byte[] image = images.get(index);
                data.writeByte(size == 256 ? 0 : size);
                data.writeByte(size == 256 ? 0 : size);
                data.writeByte(0);
                data.writeByte(0);
                writeShortLE(data, 1);
                writeShortLE(data, 32);
                writeIntLE(data, image.length);
                writeIntLE(data, offset);
                offset += image.length;
            }
            for (byte[] image : images) {
                data.write(image);
            }
        }
    }

    private static void writeIcns(Path outputFile) throws IOException {
        Path parent = outputFile.toAbsolutePath().getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }

        List<byte[]> images = new ArrayList<>();
        int totalLength = 8;
        for (int size : ICNS_SIZES) {
            ByteArrayOutputStream png = new ByteArrayOutputStream();
            ImageIO.write(render(size), "png", png);
            byte[] image = png.toByteArray();
            images.add(image);
            totalLength += 8 + image.length;
        }

        try (OutputStream out = Files.newOutputStream(outputFile);
             DataOutputStream data = new DataOutputStream(out)) {
            data.writeBytes("icns");
            data.writeInt(totalLength);
            for (int index = 0; index < ICNS_TYPES.length; index++) {
                data.writeBytes(ICNS_TYPES[index]);
                data.writeInt(8 + images.get(index).length);
                data.write(images.get(index));
            }
        }
    }

    private static BufferedImage render(int size) {
        BufferedImage image = new BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = image.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g.scale(size / 1024.0, size / 1024.0);

        RoundRectangle2D background = new RoundRectangle2D.Double(64, 64, 896, 896, 208, 208);
        g.setPaint(new GradientPaint(64, 64, new Color(31, 78, 160), 960, 960, new Color(15, 143, 124)));
        g.fill(background);

        drawVolleyball(g);
        drawWhistle(g);
        g.dispose();
        return image;
    }

    private static void drawVolleyball(Graphics2D g) {
        g.setColor(new Color(16, 35, 63, 56));
        g.fillOval(184, 198, 448, 448);

        Ellipse2D ball = new Ellipse2D.Double(160, 170, 448, 448);
        g.setColor(new Color(248, 250, 252));
        g.fill(ball);

        Shape oldClip = g.getClip();
        g.setClip(ball);
        g.setColor(new Color(31, 78, 160));
        g.setStroke(new BasicStroke(42, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        g.draw(path("M384 170 C336 236 314 308 319 386 C325 473 366 545 442 602"));
        g.draw(path("M190 315 C260 348 337 358 420 345 C495 333 558 302 610 252"));
        g.draw(path("M216 508 C292 475 367 471 442 498 C501 519 550 556 589 609"));
        g.draw(path("M474 190 C453 258 456 327 483 396 C510 467 561 523 636 564"));
        g.setClip(oldClip);

        g.setColor(new Color(18, 52, 95));
        g.setStroke(new BasicStroke(24, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        g.draw(ball);
    }

    private static void drawWhistle(Graphics2D g) {
        AffineTransform oldTransform = g.getTransform();
        g.rotate(Math.toRadians(6), 720, 670);

        g.setColor(new Color(16, 35, 63, 64));
        g.fill(path("M522 618 C556 543 646 507 721 540 L845 595 C879 610 894 650 878 684 L828 796 C813 830 773 845 739 830 L615 775 C540 742 506 653 522 618 Z"));

        Path2D body = path("M522 598 C556 523 646 487 721 520 L845 575 C879 590 894 630 878 664 L828 776 C813 810 773 825 739 810 L615 755 C540 722 506 633 522 598 Z");
        g.setColor(new Color(248, 250, 252));
        g.fill(body);

        g.setColor(new Color(255, 207, 74));
        g.fill(path("M791 568 L907 619 L853 741 L737 690 Z"));
        g.setColor(new Color(248, 250, 252));
        g.fill(path("M870 604 L921 627 C943 637 953 663 943 685 L927 721 C917 743 891 753 869 743 L818 720 Z"));

        g.setColor(new Color(15, 143, 124));
        g.fill(new Ellipse2D.Double(595, 590, 140, 140));
        g.setColor(new Color(18, 52, 95));
        g.setStroke(new BasicStroke(34, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        g.draw(body);

        g.setColor(new Color(248, 250, 252));
        g.setStroke(new BasicStroke(34, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        g.draw(path("M800 786 C768 843 706 878 638 876"));
        g.setTransform(oldTransform);
    }

    private static Path2D path(String value) {
        String[] tokens = value.replaceAll("([MLCZ])", " $1 ").trim().split("[ ,]+");
        Path2D path = new Path2D.Double();
        int index = 0;
        while (index < tokens.length) {
            String command = tokens[index++];
            if ("M".equals(command)) {
                path.moveTo(Double.parseDouble(tokens[index++]), Double.parseDouble(tokens[index++]));
            } else if ("L".equals(command)) {
                path.lineTo(Double.parseDouble(tokens[index++]), Double.parseDouble(tokens[index++]));
            } else if ("C".equals(command)) {
                path.curveTo(
                        Double.parseDouble(tokens[index++]), Double.parseDouble(tokens[index++]),
                        Double.parseDouble(tokens[index++]), Double.parseDouble(tokens[index++]),
                        Double.parseDouble(tokens[index++]), Double.parseDouble(tokens[index++]));
            } else if ("Z".equals(command)) {
                path.closePath();
            }
        }
        return path;
    }

    private static void writeShortLE(DataOutputStream data, int value) throws IOException {
        data.writeByte(value & 0xff);
        data.writeByte((value >>> 8) & 0xff);
    }

    private static void writeIntLE(DataOutputStream data, int value) throws IOException {
        data.writeByte(value & 0xff);
        data.writeByte((value >>> 8) & 0xff);
        data.writeByte((value >>> 16) & 0xff);
        data.writeByte((value >>> 24) & 0xff);
    }
}

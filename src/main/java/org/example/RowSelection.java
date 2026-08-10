package org.example;

final class RowSelection {
    private final String sectionHeading;
    private final GameRow gameRow;
    private boolean dirty;

    RowSelection(String sectionHeading, GameRow gameRow) {
        this.sectionHeading = sectionHeading;
        this.gameRow = gameRow;
    }

    String sectionHeading() {
        return sectionHeading;
    }

    GameRow gameRow() {
        return gameRow;
    }

    boolean isDirty() {
        return dirty;
    }

    void setDirty(boolean dirty) {
        this.dirty = dirty;
    }
}

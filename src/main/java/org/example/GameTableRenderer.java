package org.example;

import javax.swing.JTable;
import javax.swing.border.EmptyBorder;
import javax.swing.table.DefaultTableCellRenderer;
import java.awt.Color;
import java.awt.Component;

final class GameTableRenderer extends DefaultTableCellRenderer {
    private final int statusColumnIndex;
    private final Color mutedTextColor;
    private final Color stripeColor;

    GameTableRenderer(int statusColumnIndex, Color mutedTextColor, Color stripeColor) {
        this.statusColumnIndex = statusColumnIndex;
        this.mutedTextColor = mutedTextColor;
        this.stripeColor = stripeColor;
    }

    @Override
    public Component getTableCellRendererComponent(JTable table, Object value, boolean isSelected, boolean hasFocus, int row, int column) {
        Component component = super.getTableCellRendererComponent(table, value, isSelected, hasFocus, row, column);
        if (!isSelected) {
            int modelRow = table.convertRowIndexToModel(row);
            Object status = table.getModel().getValueAt(modelRow, statusColumnIndex);
            boolean completed = status != null && !status.toString().isBlank();
            component.setBackground(completed ? new Color(232, 232, 232) : row % 2 == 0 ? Color.WHITE : stripeColor);
            component.setForeground(completed ? mutedTextColor : Color.BLACK);
        } else {
            component.setForeground(Color.BLACK);
        }
        setBorder(new EmptyBorder(0, 6, 0, 6));
        return component;
    }
}

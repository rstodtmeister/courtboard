package org.example;

import javax.swing.JButton;
import javax.swing.JTable;
import javax.swing.table.TableCellRenderer;
import java.awt.Component;

final class ButtonCellRenderer extends JButton implements TableCellRenderer {
    ButtonCellRenderer(String text) {
        super(text);
        setFocusPainted(false);
    }

    @Override
    public Component getTableCellRendererComponent(JTable table, Object value, boolean isSelected, boolean hasFocus, int row, int column) {
        setText(value == null || value.toString().isBlank() ? "Bearbeiten" : value.toString());
        setEnabled(table.isEnabled());
        return this;
    }
}

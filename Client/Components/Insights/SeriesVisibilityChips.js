import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';

/**
 * Per-series toggle chips that double as the legend.
 *
 * Props:
 * - series:        [{ name, ... }]
 * - activeMap:     { [seriesName]: boolean }
 * - onToggle:      (name) => void
 * - getLabel:      (s) => string         // e.g., nameFor
 * - getColor:      (s) => string         // returns hex or rgb(a), e.g. "#3B82F6"
 * - variant:       "swatch" | "fill"     // swatch (dot on left) or filled chip
 *
 * Optional style overrides:
 * - containerStyle, chipStyle, chipTextStyle
 */
export default function SeriesVisibilityChips({
  series = [],
  activeMap = {},
  onToggle,
  getLabel = (s) => s.name,
  getColor = () => '#6B7280',
  variant = 'swatch',
  containerStyle,
  chipStyle,
  chipTextStyle,
}) {
  if (!series?.length) return null;

  return (
    <View style={[styles.row, containerStyle]}>
      {series.map((s) => {
        const name = s.name;
        const label = getLabel(s);
        const color = normalizeColor(getColor(s));
        const active = !!activeMap[name];

        const fillBg = variant === 'fill'
          ? rgba(color, active ? 0.22 : 0.12)
          : '#fff';

        const borderColor = variant === 'fill' ? color : (active ? '#111' : '#bbb');
        const textColor = variant === 'fill'
          ? readableTextOn(fillBg, '#111', '#fff')
          : (active ? '#111' : '#333');

        return (
          <Pressable
            key={name}
            onPress={() => onToggle?.(name)}
            style={[
              styles.chip,
              { backgroundColor: fillBg, borderColor },
              chipStyle,
            ]}
          >
            {variant === 'swatch' && (
              <View style={[styles.swatch, { backgroundColor: color }]} />
            )}
            <Text style={[styles.chipText, { color: textColor }, chipTextStyle]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------- helpers ---------- */

// Accepts "#RRGGBB", "#RGB", or "rgb(a)"
function normalizeColor(c) {
  if (!c) return '#6B7280';
  if (c.startsWith('rgb')) return c;
  // expand #RGB
  if (/^#([0-9a-fA-F]{3})$/.test(c)) {
    const r = c[1], g = c[2], b = c[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return c; // assume #RRGGBB
}

function rgba(hexOrRgb, a) {
  if (hexOrRgb.startsWith('rgb')) {
    // already rgb(a) – just tack on alpha if not present
    if (hexOrRgb.startsWith('rgba')) return hexOrRgb;
    const inside = hexOrRgb.slice(hexOrRgb.indexOf('(') + 1, hexOrRgb.indexOf(')'));
    return `rgba(${inside}, ${a})`;
  }
  // hex path
  const hex = normalizeColor(hexOrRgb).replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function readableTextOn(bgRgba, dark = '#111', light = '#fff') {
  // quick luminance check from rgba(...)
  const nums = bgRgba.match(/[\d.]+/g) || [255, 255, 255, 1];
  const [r, g, b] = nums.map(Number);
  const L = (0.2126 * r + 0.7152 * g + 0.0722 * b); // 0..255
  return L > 155 ? dark : light; // if bg is light, use dark text
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipText: { fontWeight: '600' },
  swatch: { width: 10, height: 10, borderRadius: 2, marginRight: 6 },
});

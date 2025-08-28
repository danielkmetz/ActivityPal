import React, { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet, Dimensions, Text } from 'react-native';
import { LineChart } from 'react-native-chart-kit';

const screenWidth = Dimensions.get('window').width;

const Y_AXIS_WIDTH = 48;
const CHART_PAD_TOP = 20;
const CHART_PAD_BOTTOM = 10;

function InsightsLineChart({
  lineData,
  baseDates,
  height = 280,
  pxPerPoint = 40,
  segments = 4,
  fromZero = true,
}) {
  const [tooltip, setTooltip] = useState(null);

  // Normalize to avoid conditional hooks
  const safeLineData = useMemo(() => {
    return lineData && Array.isArray(lineData.datasets) && lineData.datasets.length
      ? lineData
      : { labels: [], datasets: [], legends: [], pointsCount: 0, tickEvery: 1 };
  }, [lineData]);

  const pointsCount = safeLineData.pointsCount || safeLineData.labels.length || 0;

  const chartWidth = useMemo(() => {
    if (!pointsCount) return Math.max(120, screenWidth - 20 - Y_AXIS_WIDTH);
    return Math.max(screenWidth - 20 - Y_AXIS_WIDTH, pointsCount * pxPerPoint);
  }, [pointsCount, pxPerPoint]);

  // Always call this hook; it will just work over empty arrays if no data
  const { yMin, yMax, ticks } = useMemo(() => {
    const values = safeLineData.datasets.flatMap(ds => ds.data ?? []);
    const max = values.length ? Math.max(...values) : 0;
    const minRaw = values.length ? Math.min(...values) : 0;
    const min = fromZero && minRaw > 0 ? 0 : minRaw;

    const range = Math.max(1, max - min);
    const step = range / segments;

    const t = Array.from({ length: segments + 1 }, (_, i) =>
      Math.round((max - i * step) * 100) / 100
    );
    return { yMin: min, yMax: max, ticks: t };
  }, [safeLineData.datasets, segments, fromZero]);

  const hasData = safeLineData.datasets.length > 0;
  const drawableHeight = height - CHART_PAD_TOP - CHART_PAD_BOTTOM - 25;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      {/* Frozen Y-axis column */}
      <View style={[styles.yAxisColumn, { width: Y_AXIS_WIDTH, height }]}>
        <View style={{ height: CHART_PAD_TOP, marginTop: 35 }} />
        <View style={[styles.yTicks, { height: drawableHeight }]}>
          {ticks.map((label, i) => (
            <Text key={i} style={styles.yAxisLabel} numberOfLines={1}>
              {label}
            </Text>
          ))}
        </View>
        <View style={{ height: CHART_PAD_BOTTOM }} />
      </View>

      {/* Scrollable chart */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={() => setTooltip(null)}
        contentContainerStyle={{ paddingRight: 8 }}
      >
        <View>
          {hasData ? (
            <>
              <LineChart
                data={{ labels: safeLineData.labels, datasets: safeLineData.datasets, legend: [] }}
                width={chartWidth}
                height={height}
                fromZero={fromZero}
                segments={segments}
                chartConfig={{
                  backgroundColor: '#ffffff',
                  backgroundGradientFrom: '#ffffff',
                  backgroundGradientTo: '#ffffff',
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(0,0,0,${opacity})`,
                  labelColor: (opacity = 1) => `rgba(0,0,0,${opacity})`,
                  propsForDots: { r: '3' },
                  propsForBackgroundLines: { strokeDasharray: '4 6' },
                }}
                style={styles.chart}
                bezier={false}
                verticalLabelRotation={safeLineData.tickEvery === 1 ? 30 : 0}
                withHorizontalLabels={false}
                withVerticalLabels={true}
                withInnerLines
                onDataPointClick={({ value, index, x, y }) => {
                  const d =
                    baseDates?.[index] &&
                    new Date(baseDates[index]).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    });
                  setTooltip({ x, y, value, label: d || `Index ${index}` });
                }}
              />
              {tooltip && (
                <Pressable style={StyleSheet.absoluteFill} onPress={() => setTooltip(null)}>
                  <View
                    style={[
                      styles.tooltip,
                      { left: Math.max(8, tooltip.x - 70), top: Math.max(8, tooltip.y - 64) },
                    ]}
                  >
                    <Text style={styles.tooltipTitle}>{tooltip.label}</Text>
                    <Text style={styles.tooltipValue}>{tooltip.value}</Text>
                  </View>
                </Pressable>
              )}
            </>
          ) : (
            <Text style={styles.muted}>No time-series data yet.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { marginVertical: 8, borderRadius: 16 },
  muted: { color: '#666', textAlign: 'center', marginVertical: 8 },
  tooltip: {
    position: 'absolute',
    width: 140,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(0,0,0,0.88)',
    borderRadius: 8,
  },
  tooltipTitle: { color: '#fff', fontSize: 12, marginBottom: 2 },
  tooltipValue: { color: '#fff', fontSize: 16, fontWeight: '700' },
  yAxisColumn: { backgroundColor: '#fff', paddingRight: 6 },
  yTicks: { justifyContent: 'space-between' },
  yAxisLabel: { fontSize: 12, color: '#000', textAlign: 'right' },
});

export default React.memo(InsightsLineChart);

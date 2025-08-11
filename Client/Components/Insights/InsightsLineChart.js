import React, { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet, Dimensions, Text } from 'react-native';
import { LineChart } from 'react-native-chart-kit';

const screenWidth = Dimensions.get('window').width;

function InsightsLineChart({
  lineData,         // { labels, datasets, legends, pointsCount, tickEvery }
  baseDates,        // raw ISO date array aligned to points (for tooltip)
  height = 280,
  pxPerPoint = 40,
}) {
  const [tooltip, setTooltip] = useState(null); // { x, y, value, label }

  const width = useMemo(() => {
    const count = lineData?.pointsCount || 0;
    if (!count) return screenWidth - 20;
    return Math.max(screenWidth - 20, count * pxPerPoint);
  }, [lineData?.pointsCount, pxPerPoint]);

  if (!lineData || !lineData.datasets?.length) {
    return <Text style={styles.muted}>No time‑series data yet.</Text>;
  }

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={() => setTooltip(null)}
      >
        <View>
          <LineChart
            data={{
              labels: lineData.labels,
              datasets: lineData.datasets,
              legend: lineData.legends,
            }}
            width={width}
            height={height}
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
            verticalLabelRotation={lineData.tickEvery === 1 ? 30 : 0}
            segments={4}
            fromZero
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
});

export default React.memo(InsightsLineChart);

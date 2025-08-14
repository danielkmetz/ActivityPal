import React from 'react';
import { View, Text } from 'react-native';
import { PieChart } from 'react-native-chart-kit';
import InsightsLineChart from './InsightsLineChart';
import SeriesVisibilityChips from './SeriesVisibilityChips';

export default React.memo(function ChartsSection({
  chartTitle,
  series = [],                 // insights.series
  activeMap = {},              // { [name]: boolean }
  onToggleSeries,              // (name) => void
  getSeriesLabel = (s) => s.name,
  lineData,                    // { labels, datasets, legends, pointsCount, tickEvery }
  baseDates,                   // raw dates for tooltips
  pieData = [],                // [{ name, count, color, ... }]
  range,                       // { start, end, interval }
  screenWidth,
  SERIES_COLORS,
  styles,
}) {
  return (
    <View>
      <Text style={styles.chartTitle}>{chartTitle}</Text>

      {!!series.length && (
        <SeriesVisibilityChips
          series={series}
          activeMap={activeMap}
          onToggle={onToggleSeries}
          getLabel={getSeriesLabel}
          getColor={(s) => {
            const key = (s.name || '').toLowerCase();
            return SERIES_COLORS[key] || SERIES_COLORS.default;
          }}
          variant="swatch"  // or "fill"
        />
      )}

      <InsightsLineChart lineData={lineData} baseDates={baseDates} />

      <Text style={styles.chartTitle}>Totals</Text>
      <PieChart
        data={pieData}
        width={screenWidth - 20}
        height={240}
        accessor="count"
        backgroundColor="transparent"
        chartConfig={{ color: (opacity = 1) => `rgba(0,0,0,${opacity})` }}
        paddingLeft="15"
        absolute
      />

      {range && (
        <Text style={styles.meta}>
          Range: {new Date(range.start).toLocaleDateString()} — {new Date(range.end).toLocaleDateString()} · Interval: {range.interval}
        </Text>
      )}
    </View>
  );
});

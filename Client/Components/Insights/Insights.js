import React, { useState } from 'react';
import { View, Text, Dimensions, StyleSheet } from 'react-native';
import { LineChart, BarChart, PieChart } from 'react-native-chart-kit';
import { calculateMetrics } from '../../functions';
import { selectUser } from '../../Slices/UserSlice';
import { useSelector } from 'react-redux';

const screenWidth = Dimensions.get('window').width;

export default function Insights() {
    const businessData = useSelector(selectUser).businessDetails;
    
    // Calculate metrics (this could be passed as props too)
    const metrics = calculateMetrics(businessData);

    return (
        <View style={styles.container}>
        <Text style={styles.title}>Insights</Text>

        {/* Line Chart for Reviews Per Month */}
        <Text style={styles.chartTitle}>Reviews Per Month</Text>
        <LineChart
            data={{
            labels: Object.keys(metrics.reviewsPerMonth),
            datasets: [
                {
                data: Object.values(metrics.reviewsPerMonth),
                },
            ],
            }}
            width={screenWidth - 20}
            height={220}
            chartConfig={{
            backgroundColor: '#e26a00',
            backgroundGradientFrom: '#fb8c00',
            backgroundGradientTo: '#ffa726',
            decimalPlaces: 0, // No decimal places
            color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
            labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
            }}
            style={styles.chart}
        />

        {/* Pie Chart for Event Breakdown */}
        <Text style={styles.chartTitle}>Event Breakdown</Text>
        <PieChart
            data={[
            {
                name: 'Upcoming Events',
                count: metrics.upcomingEvents,
                color: 'rgba(255, 99, 132, 0.6)',
                legendFontColor: '#7F7F7F',
                legendFontSize: 15,
            },
            {
                name: 'Past Events',
                count: metrics.pastEvents,
                color: 'rgba(54, 162, 235, 0.6)',
                legendFontColor: '#7F7F7F',
                legendFontSize: 15,
            },
            ]}
            width={screenWidth - 20}
            height={220}
            chartConfig={{
            color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
            }}
            accessor="count"
            backgroundColor="transparent"
            paddingLeft="15"
            absolute // Show exact values
        />
        </View>
    );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
    backgroundColor: '#fff',
    marginTop: 60,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginVertical: 10,
    textAlign: 'left',
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
});

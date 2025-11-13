import React from "react";
import { View, Text, Switch, StyleSheet } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";

export default function TimeSection({
  allDay,
  setAllDay,
  startTime,
  setStartTime,
  endTime,
  setEndTime,
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Time</Text>
      <View style={styles.toggleRow}>
        <Text style={styles.label}>All Day</Text>
        <Switch value={allDay} onValueChange={setAllDay} />
      </View>
      {!allDay && (
        <View style={styles.dateRow}>
          <View style={styles.timeInput}>
            <Text style={styles.label}>Start Time</Text>
            <DateTimePicker
              value={startTime || new Date()}
              mode="time"
              onChange={(e, t) => t && setStartTime(t)}
            />
          </View>
          <View style={[styles.timeInput, { marginTop: 10 }]}>
            <Text style={styles.label}>End Time</Text>
            <DateTimePicker
              value={endTime || new Date()}
              mode="time"
              onChange={(e, t) => t && setEndTime(t)}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 8 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginVertical: 10,
    borderBottomWidth: 1,
    borderColor: "#ccc",
    paddingBottom: 4,
  },
  label: { fontWeight: "600" },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "50%",
  },
  dateRow: { flexDirection: "column" },
  timeInput: {
    justifyContent: "space-between",
    flexDirection: "row",
    width: "50%",
    alignItems: "center",
  },
});

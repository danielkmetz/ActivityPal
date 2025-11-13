import React, { useState } from "react";
import { View, Text, Switch, TouchableOpacity, StyleSheet } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import RecurringDaysModal from '../RecurringDaysModal';

export default function WhenSection({
  isRecurring,
  setIsRecurring,
  selectedDays,
  setSelectedDays,
  startDate,
  setStartDate,
}) {
  const [recurringDaysModalVisible, setRecurringDaysModalVisible] = useState(false);

  const handleSaveRecurringDays = (days) => {
    setSelectedDays(days);
    setRecurringDaysModalVisible(false);
  };

  const handleCloseRecurringModal = () => {
    setRecurringDaysModalVisible(false);
    if (!selectedDays || selectedDays.length === 0) setIsRecurring(false);
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>When</Text>
      <View style={styles.toggleRow}>
        <Text style={styles.label}>Single Day Event</Text>
        <Switch
          value={!isRecurring}
          onValueChange={(value) => {
            const newRecurring = !value;
            setIsRecurring(newRecurring);
            if (newRecurring) {
              // switched from single-day to recurring → open modal
              setRecurringDaysModalVisible(true);
            } else {
              setSelectedDays([]);
            }
          }}
        />
      </View>
      {!isRecurring && (
        <View style={styles.dateInput}>
          <Text style={[styles.label, { marginRight: 20 }]}>Event Date</Text>
          <DateTimePicker
            value={startDate || new Date()}
            mode="date"
            display="default"
            onChange={(e, d) => d && setStartDate(d)}
          />
        </View>
      )}
      {isRecurring && (
        <View style={styles.recurringRow}>
          <Text style={styles.selectedDaysText}>
            Recurs every: {selectedDays?.length ? selectedDays.join(", ") : "—"}
          </Text>
          <TouchableOpacity
            style={styles.editPill}
            onPress={() => setRecurringDaysModalVisible(true)}
          >
            <Text style={styles.editPillText}>Edit</Text>
          </TouchableOpacity>
        </View>
      )}
      <RecurringDaysModal
        visible={recurringDaysModalVisible}
        selectedDays={selectedDays}
        onSave={handleSaveRecurringDays}
        onClose={handleCloseRecurringModal}
      />
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
  dateInput: { flexDirection: "row", alignItems: "center" },
  recurringRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  selectedDaysText: { marginTop: 0, fontWeight: "600" },
  editPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#aaa",
  },
  editPillText: { fontWeight: "600" },
});

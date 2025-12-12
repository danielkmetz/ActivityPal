import React, { memo } from "react";
import { View, Text, StyleSheet } from "react-native";
import CountdownPill from "./CountdownPill";

const InviteDetails = memo(function InviteDetails({
  dateTime,
  formatEventDate,
  timeLeft,
  note,
}) {
  if (!dateTime) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.datetime}>On {formatEventDate(dateTime)}</Text>
      {!!note && <Text style={styles.note}>{note}</Text>}
      <CountdownPill label="Starts in:" value={timeLeft} />
    </View>
  );
});

export default InviteDetails;

const styles = StyleSheet.create({
  wrap: {
    marginTop: 6,
  },
  datetime: {
    fontSize: 14,
    color: "#666",
  },
  note: {
    fontStyle: "italic",
    color: "#555",
    marginTop: 10,
  },
});

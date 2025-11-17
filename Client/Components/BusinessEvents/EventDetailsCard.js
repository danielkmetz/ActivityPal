import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { formatDate, formatTimeTo12Hour } from "../../functions";

const EventDetailsCard = ({ item, selectedTab }) => {
  const renderPromotionDetails = () => (
    <>
      {!item.recurring && (
        <>
          <Text style={styles.itemDate}>Starts: {formatTimeTo12Hour(item.startTime)}</Text>
          <Text style={styles.promoItem}>Ends: {formatTimeTo12Hour(item.endTime)}</Text>
        </>
      )}
      {item.recurring && item.recurringDays.length > 0 && (
        <Text style={styles.recurring}>Every: {item.recurringDays.join(", ")}</Text>
      )}
      {item.allDay ? (
        <Text style={styles.promoItem}>Time: All day</Text>
      ) : (
        <Text style={styles.promoItem}>
          Time: {formatTimeTo12Hour(item.startTime)} to {formatTimeTo12Hour(item.endTime)}
        </Text>
      )}
    </>
  );

  const renderEventDetails = () => (
    <>
      <Text style={styles.itemDate}>
        {item.recurringDays.length > 0 ? (
          <Text>Every {item.recurringDays.join(", ")}</Text>
        ) : (
          <Text>Date: {formatDate(item.date)}</Text>
        )}
      </Text>
      <Text>
        {item.allDay ? (
          <Text style={styles.promoItem}>Time: All day</Text>
        ) : (
          <Text style={styles.promoItem}>
            Time: {formatTimeTo12Hour(item.startTime)} to {formatTimeTo12Hour(item.endTime)}
          </Text>
        )}
      </Text>
    </>
  );

  return (
    <View style={styles.descriptionAndDate}>
      <Text style={styles.itemTitle}>{item.title}</Text>
      {selectedTab === "promotions" ? renderPromotionDetails() : renderEventDetails()}
      <Text style={styles.itemDate}>{item.description}</Text>
    </View>
  );
};

export default EventDetailsCard;

const styles = StyleSheet.create({
    descriptionAndDate: {
      padding: 10,
      marginBottom: 10,
    },
    itemTitle: {
      fontSize: 18,
      fontWeight: "bold",
    },
    itemDate: {
      fontSize: 14,
      color: "#555",
      marginTop: 5,
    },
    promoItem: {
      fontSize: 14,
      color: "#555",
    },
    recurring: {
      fontSize: 14,
      color: "#555",
      marginTop: 5,
    },
  });

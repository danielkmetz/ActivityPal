import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function BusinessNavTabs({ business, activeSection, setActiveSection }) {
  return (
    <View style={styles.navButtonsContainer}>
      {business && (
        <>
          <TouchableOpacity
            style={[styles.navButton, activeSection === 'reviews' && styles.activeButton]}
            onPress={() => setActiveSection('reviews')}
          >
            <Text style={styles.navButtonText}>Reviews</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.navButton, activeSection === 'events' && styles.activeButton]}
            onPress={() => setActiveSection('events')}
          >
            <Text style={styles.navButtonText}>Events</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.navButton, activeSection === 'promotions' && styles.activeButton]}
            onPress={() => setActiveSection('promotions')}
          >
            <Text style={styles.navButtonText}>Promotions</Text>
          </TouchableOpacity>
        </>
      )}
      <TouchableOpacity
        style={[styles.navButton, activeSection === 'about' && styles.activeButton]}
        onPress={() => setActiveSection('about')}
      >
        <Text style={styles.navButtonText}>About</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.navButton, activeSection === 'photos' && styles.activeButton]}
        onPress={() => setActiveSection('photos')}
      >
        <Text style={styles.navButtonText}>Photos</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  navButtonsContainer: {
    flexDirection: 'row',
    marginVertical: 10,
    marginLeft: 5,
  },
  navButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 30,
  },
  activeButton: {
    backgroundColor: 'rgba(144, 238, 144, 0.4)',
  },
  navButtonText: {
    color: 'black',
    fontWeight: 'bold',
  },
});

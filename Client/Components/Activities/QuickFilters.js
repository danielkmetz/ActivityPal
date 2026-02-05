import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const BRAND = '#008080';
const ON_BRAND = '#ffffff';

const FILTERS = [
  { key: 'dateNight', label: 'Date Night' },
  { key: 'drinksAndDining', label: 'Dining & Drinks' },
  { key: 'outdoor', label: 'Outdoor' },
  { key: 'movieNight', label: 'Movies' },
  { key: 'gaming', label: 'Gaming' },
  { key: 'artAndCulture', label: 'Art & Culture' },
  { key: 'familyFun', label: 'Family' },
  { key: 'petFriendly', label: 'Pet Friendly' },
  { key: 'liveMusic', label: 'Live Music' },
  { key: 'whatsClose', label: 'Close By' },
  { key: 'Dining', label: 'Restaurants' },
];

const QuickFilters = ({ keyboardOpen, onFilterPress, stylesOverride = {}, icons = {}, activeKey }) => {
  const data = useMemo(() => FILTERS, []);

  return (
    <>
      <Text style={[styles.filterTitle, stylesOverride.filterTitle]}>Quick Filters</Text>
      <View style={[styles.filterContainer, stylesOverride.filterContainer]}>
        {data.map(({ key, label }) => {
          const IconRenderer = typeof icons[key] === 'function' ? icons[key] : null;
          const isActive = activeKey === key;

          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.filterItem,
                keyboardOpen && styles.disabledFilter,
                stylesOverride.filterItem,
              ]}
              onPress={() => !keyboardOpen && onFilterPress(key)}
              disabled={keyboardOpen}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.filterText,
                  isActive && { color: BRAND },
                  stylesOverride.filterText,
                ]}
                numberOfLines={2}
              >
                {label}
              </Text>

              <View
                style={[
                  styles.iconToken,
                  isActive && { backgroundColor: BRAND, borderColor: BRAND },
                  stylesOverride.iconToken,
                ]}
              >
                {IconRenderer ? (
                  <IconRenderer size={26} color={isActive ? ON_BRAND : BRAND} />
                ) : (
                  <Text style={{ color: BRAND, fontSize: 18 }}>•</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );
};

export default QuickFilters;

const styles = StyleSheet.create({
  filterTitle: {
    fontSize: 20,
    marginLeft: 30,
    fontFamily: 'Poppins Bold',
    marginTop: 30,
  },
  filterContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 30,
    marginTop: 30,
    paddingHorizontal: 10,
  },
  filterItem: {
    alignItems: 'center',
    width: '30%',
    marginBottom: 15,
  },
  iconToken: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e6efef',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  filterText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: 'black',
    marginBottom: 7,
    textAlign: 'center',
  },
  disabledFilter: {
    opacity: 0.5,
  },
});

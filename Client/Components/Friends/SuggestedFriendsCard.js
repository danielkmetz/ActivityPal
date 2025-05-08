import React from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet } from 'react-native';
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg';
import { FontAwesome } from '@expo/vector-icons';
import { selectSuggestedUsers } from '../../Slices/friendsSlice';
import { useSelector } from 'react-redux';

export default function SuggestedFriendsCard({ onSelectUser }) {
    const suggestions = useSelector(selectSuggestedUsers);
  
  const visibleSuggestions = suggestions.slice(0, 5);

  if (!suggestions || suggestions.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Suggested Friends</Text>
      <FlatList
        data={visibleSuggestions}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.item} onPress={() => onSelectUser(item)}>
            <Image
              source={item.presignedProfileUrl ? { uri: item.presignedProfileUrl } : profilePicPlaceholder}
              style={styles.pic}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.firstName} {item.lastName}</Text>
              <Text style={styles.mutual}>{item.mutualCount} mutual friend{item.mutualCount > 1 ? 's' : ''}</Text>
            </View>
            <FontAwesome name="arrow-right" size={20} color="#007bff" />
          </TouchableOpacity>
        )}
        scrollEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 10,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  title: {
    fontSize: 17,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  pic: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
  },
  name: {
    fontSize: 15,
    fontWeight: '500',
  },
  mutual: {
    fontSize: 13,
    color: '#666',
  },
});

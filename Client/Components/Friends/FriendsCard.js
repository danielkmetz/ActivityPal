import React from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg';

export default function FriendsCard({
  friends,
  friendsDetails,
  onSearchPress,
  onFriendPress,
}) {
  
  return (
    <View style={styles.sectionContainer}>
      <View style={styles.header}>
        <Text style={styles.sectionTitle}>Friends: {friends?.length || 0}</Text>
        <TouchableOpacity onPress={onSearchPress} style={{ marginRight: 20 }}>
          <FontAwesome name="search" size={20} color="#007bff" />
        </TouchableOpacity>
      </View>

      {friends?.length > 0 ? (
        <>
          <FlatList
            data={friendsDetails}
            keyExtractor={(item) => item._id}
            renderItem={({ item }) => (
              <View style={styles.friendContainer}>
                <View style={styles.picAndName}>
                  <Image
                    source={item.profilePicUrl ? { uri: item.profilePicUrl } : profilePicPlaceholder}
                    style={styles.profilePic}
                  />
                  <Text>{item.firstName} {item.lastName}</Text>
                </View>
                <TouchableOpacity
                  style={styles.suggestionContainer}
                  onPress={() => onFriendPress(item)}
                >
                  <FontAwesome name="arrow-right" size={24} color="#007bff" />
                </TouchableOpacity>
              </View>
            )}
            scrollEnabled={false}
          />
        </>
      ) : (
        <Text style={styles.emptyText}>No friends yet</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionContainer: {
    marginBottom: 10,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  friendContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  picAndName: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profilePic: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: 10,
  },
  suggestionContainer: {
    paddingLeft: 8,
  },
  viewAllButton: {
    marginTop: 5,
    alignSelf: 'center',
  },
  viewAllText: {
    color: '#007bff',
    fontWeight: '600',
    fontSize: 14,
  },
  emptyText: {
    color: '#aaa',
    textAlign: 'center',
    marginTop: 8,
  },
});

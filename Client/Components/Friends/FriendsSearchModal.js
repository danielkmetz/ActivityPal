import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Modal,
  Image,
  StyleSheet,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg';

export default function FriendSearchModal({
  visible,
  onClose,
  friends,
  onSelectFriend,
}) {
  const [query, setQuery] = useState('');

  const filteredFriends = useMemo(() => {
    return friends?.filter(friend =>
      `${friend.firstName} ${friend.lastName}`
        .toLowerCase()
        .includes(query.toLowerCase())
    );
  }, [query, friends]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Search Friends</Text>
          <TouchableOpacity onPress={onClose}>
            <FontAwesome name="close" size={24} color="#333" />
          </TouchableOpacity>
        </View>
        <TextInput
          style={styles.input}
          placeholder="Type a name..."
          value={query}
          onChangeText={setQuery}
          autoFocus
        />
        <FlatList
          data={filteredFriends}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.friendItem}
              onPress={() => {
                onSelectFriend(item);
                onClose();
              }}
            >
              <Image
                source={
                  item.presignedProfileUrl
                    ? { uri: item.presignedProfileUrl }
                    : profilePicPlaceholder
                }
                style={styles.profilePic}
              />
              <Text style={styles.name}>
                {item.firstName} {item.lastName}
              </Text>
              <FontAwesome name="arrow-right" size={20} color="#007bff" />
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No matching friends</Text>}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 16,
    backgroundColor: 'white',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
  },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomColor: '#eee',
    borderBottomWidth: 1,
  },
  profilePic: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
  },
  name: {
    flex: 1,
    fontSize: 16,
  },
  empty: {
    textAlign: 'center',
    color: '#999',
    marginTop: 20,
  },
});

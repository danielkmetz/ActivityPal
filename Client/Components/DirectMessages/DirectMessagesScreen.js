import React, { useEffect } from 'react';
import { View, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { chooseUserToMessage, fetchConversations } from '../../Slices/DirectMessagingSlice';
import ConversationCard from './ConversationCard';
import { useNavigation } from '@react-navigation/native';
import { Text } from 'react-native-paper';
import { selectUser } from '../../Slices/UserSlice';

const DirectMessagesScreen = () => {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const { conversations, loading, error } = useSelector(state => state.directMessages);
  const user = useSelector(selectUser);
  const currentUserId = user?.id;
  
  useEffect(() => {
    dispatch(fetchConversations());
  }, [dispatch]);

  if (loading) {
    return (
      <View style={styles.centered}><ActivityIndicator size="large" /></View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}><Text>No Messages</Text></View>
    );
  };

  const handleNavigation = (item) => {
    dispatch(chooseUserToMessage(item.otherUser));

    navigation.navigate("MessageThread", {
      conversationId: item._id,
      otherUser: item.otherUser,
    })
  }

  return (
    <>
    <FlatList
      data={conversations}
      keyExtractor={item => item._id}
      renderItem={({ item }) => (
        <ConversationCard
          conversation={item}
          onPress={() => handleNavigation(item)}
          currentUserId={currentUserId}
        />
      )}
      contentContainerStyle={styles.container}
      ListEmptyComponent={<Text>No conversations yet.</Text>}
    />
    </>
  );
};

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    fontWeight: 'bold',
  },
  container: {
    flex: 1,
    marginTop: 125,
  },
});

export default DirectMessagesScreen;

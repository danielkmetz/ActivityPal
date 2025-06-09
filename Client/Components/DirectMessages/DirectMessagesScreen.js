import React, { useEffect } from 'react';
import { View, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { fetchConversations } from '../../Slices/DirectMessagingSlice';
import ConversationCard from './ConversationCard';
import { useNavigation } from '@react-navigation/native';
import { Text } from 'react-native-paper';

const DirectMessagesScreen = () => {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const { conversations, loading, error } = useSelector(state => state.directMessages);
  const currentUserId = useSelector(state => state.user.userId);
  
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
  }

  return (
    <>
    <FlatList
      data={conversations}
      keyExtractor={item => item._id}
      renderItem={({ item }) => (
        <ConversationCard
          conversation={item}
          onPress={() => navigation.navigate('MessageThreadScreen', {
            conversationId: item._id,
            otherUser: item.otherUser,
          })}
          currentUserId={currentUserId}
        />
      )}
      contentContainerStyle={conversations.length === 0 && styles.centered}
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
});

export default DirectMessagesScreen;

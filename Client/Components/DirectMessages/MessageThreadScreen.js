import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Text,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { fetchMessages, sendMessage, resetUserToMessage } from '../../Slices/DirectMessagingSlice';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { selectUser } from '../../Slices/UserSlice';

const MessageThreadScreen = ({ route }) => {
  const { conversationId, otherUser } = route.params;
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const user = useSelector(selectUser);
  const { messagesByConversation } = useSelector(state => state.directMessages);
  const messages = messagesByConversation[conversationId] || [];
  const [input, setInput] = useState('');
  const flatListRef = useRef();

  useEffect(() => {
    dispatch(fetchMessages(conversationId));
  }, [dispatch, conversationId]);

  const handleSend = () => {
    if (!input.trim()) return;

    dispatch(sendMessage({
      conversationId,
      recipientId: otherUser._id,
      content: input.trim(),
      messageType: 'text',
    }));
    setInput('');
  };

  const renderItem = ({ item }) => {
    const isCurrentUser = item.senderId === user.id;
    return (
      <View style={[styles.messageBubble, isCurrentUser ? styles.sent : styles.received]}>
        <Text style={styles.messageText}>{item.content}</Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item._id}
        renderItem={renderItem}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      <View style={styles.inputContainer}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Type a message..."
          style={styles.input}
        />
        <TouchableOpacity onPress={handleSend} style={styles.sendButton}>
          <Ionicons name="send" size={20} color="white" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  messageList: {
    padding: 10,
  },
  messageBubble: {
    maxWidth: '75%',
    padding: 10,
    borderRadius: 10,
    marginVertical: 4,
  },
  sent: {
    backgroundColor: '#008080',
    alignSelf: 'flex-end',
  },
  received: {
    backgroundColor: '#eee',
    alignSelf: 'flex-start',
  },
  messageText: {
    color: '#000',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    borderTopWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#fafafa',
  },
  input: {
    flex: 1,
    padding: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ccc',
    marginRight: 10,
  },
  sendButton: {
    backgroundColor: '#008080',
    borderRadius: 20,
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default MessageThreadScreen;

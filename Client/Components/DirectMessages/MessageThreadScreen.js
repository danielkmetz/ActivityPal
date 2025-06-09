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
  Image,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { fetchMessages, sendMessage, selectMessagesByConversation } from '../../Slices/DirectMessagingSlice';
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg';
import { Ionicons } from '@expo/vector-icons';
import { selectUser } from '../../Slices/UserSlice';
import { selectProfilePic } from '../../Slices/PhotosSlice';

const MessageThreadScreen = ({ route }) => {
  const { conversationId, otherUser } = route.params || {};
  const initialConversationId = route.params?.conversationId;
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const messagesByConversation = useSelector(selectMessagesByConversation);
  const [input, setInput] = useState('');
  const [localConversationId, setLocalConversationId] = useState(initialConversationId);
  const resolvedConversationId = conversationId;
  const messages = messagesByConversation[localConversationId] || [];
  const flatListRef = useRef();
  const currentUserPhotoObject = useSelector(selectProfilePic)
  const currentUserProfilePic = currentUserPhotoObject?.url;
  
  useEffect(() => {
    if (resolvedConversationId) {
      dispatch(fetchMessages(resolvedConversationId));
    }
  }, [dispatch, resolvedConversationId]);


  const handleSend = async () => {
    if (!input.trim()) return;

    const resultAction = await dispatch(
      sendMessage({
        conversationId: localConversationId, // may be null initially
        recipientId: otherUser._id,
        content: input.trim(),
        messageType: 'text',
      })
    );

    if (sendMessage.fulfilled.match(resultAction)) {
      const newId = resultAction.payload?.conversationId;
      if (!localConversationId && newId) {
        setLocalConversationId(newId); // 🔁 update conversation ID to trigger reselect
      }
    }

    setInput('');
  };

  const renderItem = ({ item }) => {
    const isCurrentUser = item.senderId === user.id;
    const otherUserPic = item.otherUser?.profilePicUrl;

    return (
      <View style={[styles.messageRow, isCurrentUser ? styles.rowReverse : styles.row]}>
        {!isCurrentUser && (
          <Image
            source={otherUserPic ? { uri: otherUserPic } : profilePicPlaceholder}
            style={styles.avatar}
          />
        )}
        <View style={[styles.messageBubble, isCurrentUser ? styles.sent : styles.received]}>
          <Text style={styles.messageText}>{item.content}</Text>
        </View>
        {isCurrentUser && (
          <Image
            source={currentUserProfilePic ? { uri: currentUserProfilePic } : profilePicPlaceholder}
            style={styles.avatar}
          />
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item._id}
        renderItem={renderItem}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: true })
        }
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
    marginTop: 130,
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
    backgroundColor: '#00cc99',
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
    marginBottom: 30,
  },
  sendButton: {
    backgroundColor: '#008080',
    borderRadius: 20,
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginVertical: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowReverse: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginHorizontal: 6,
  },
});

export default MessageThreadScreen;

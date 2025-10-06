import React, { useEffect, useState, useRef } from 'react';
import {
  View, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { fetchMessages, sendMessage, selectMessagesByConversation, editMessage, deleteMessage } from '../../Slices/DirectMessagingSlice';
import { Ionicons } from '@expo/vector-icons';
import { selectUser } from '../../Slices/UserSlice';
import { selectMediaFromGallery } from '../../utils/selectPhotos';
import VideoThumbnail from '../Reviews/VideoThumbnail';
import { handlePhotoUpload } from '../../utils/photoUploadHelper';
import CommentOptionsModal from '../Reviews/CommentOptionsModal';
import { isVideo } from '../../utils/isVideo';
import { groupMessagesByDate } from '../../utils/groupMessagesByDate';
import MessageItem from './MessageItem';
import { connectDmSocket } from '../../app/socket/dmSocketClient';

const MessageThreadScreen = ({ route }) => {
  const { conversationId, participants } = route.params || {};
  const initialConversationId = route.params?.conversationId;
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const messagesByConversation = useSelector(selectMessagesByConversation);
  const [input, setInput] = useState('');
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [localConversationId, setLocalConversationId] = useState(initialConversationId);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [isOptionsModalVisible, setOptionsModalVisible] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const resolvedConversationId = conversationId;
  const messages = messagesByConversation[localConversationId] || [];
  const flatListRef = useRef();
  const groupedMessages = groupMessagesByDate(messages);

  useEffect(() => {
    if (process.env.EXPO_PUBLIC_SERVER_URL && user?.token) {
      connectDmSocket(process.env.EXPO_PUBLIC_SERVER_URL);
    }
  }, [user?.token]);

  useEffect(() => {
    if (resolvedConversationId) {
      dispatch(fetchMessages(resolvedConversationId));
    }
  }, [dispatch, resolvedConversationId]);

  const handleEdit = () => {
    setInput(selectedMessage?.content || '');
    setSelectedMedia(selectedMessage?.media || null);
    setEditingMessageId(selectedMessage?._id);
    setOptionsModalVisible(false);
  };

  const handleDelete = async () => {
    setOptionsModalVisible(false);
    if (selectedMessage?._id) {
      await dispatch(deleteMessage({ conversationId, messageId: selectedMessage._id }));
    }
  };

  const handleSend = async () => {
    if (!input.trim() && !selectedMedia) return;

    let uploadedMedia = null;

    if (selectedMedia && !selectedMedia.url && !selectedMedia.photoKey) {
      try {
        const uploaded = await handlePhotoUpload({
          dispatch,
          userId: user.id,
          placeId: 'messages',
          photos: [selectedMedia],
        });

        if (uploaded.length > 0) {
          const file = uploaded[0];
          const mediaType = isVideo(selectedMedia) ? 'video' : 'image';
          uploadedMedia = { photoKey: file.photoKey, mediaType };
        } else {
          return;
        }
      } catch (err) {
        return;
      }
    }

    if (editingMessageId) {
      await dispatch(editMessage({
        messageId: editingMessageId,
        content: input.trim(),
        media: uploadedMedia,
      }));
      setEditingMessageId(null);
    } else {
      const contentToSend = input.trim() || (uploadedMedia ? '[media]' : '');
      const messageType = uploadedMedia ? uploadedMedia.mediaType : 'text';
      const recipientIds = (participants || []).map(u => u._id);

      const payload = {
        conversationId: localConversationId || null,
        recipientIds,
        content: contentToSend,
        messageType,
        media: uploadedMedia || null,
      };

      const resultAction = await dispatch(sendMessage(payload));
      if (sendMessage.fulfilled.match(resultAction)) {
        const newId = resultAction.payload?.conversationId;
        if (!localConversationId && newId) {
          setLocalConversationId(newId);
        }
      }
    }

    setInput('');
    setSelectedMedia(null);
  };

  const handleSelectMedia = async () => {
    const results = await selectMediaFromGallery();
    if (results?.length > 0) setSelectedMedia(results[0]);
  };

  return (
    <>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <FlatList
          ref={flatListRef}
          data={groupedMessages}
          keyExtractor={(item) => item._id || item.id}
          renderItem={({ item }) => (
            <MessageItem
              item={item}
              onLongPress={(msg) => {
                setSelectedMessage(msg);
                setOptionsModalVisible(true);
              }}
            />
          )}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />
        <View style={styles.inputContainer}>
          <View style={styles.inputCard}>
            {selectedMedia && (
              <View style={styles.previewWrapper}>
                {!isVideo(selectedMedia) ? (
                  <Image source={{ uri: selectedMedia.uri }} style={styles.previewMedia} />
                ) : (
                  <VideoThumbnail file={selectedMedia} width={120} height={120} />
                )}
                <TouchableOpacity
                  style={styles.removePreviewButton}
                  onPress={() => setSelectedMedia(null)}
                >
                  <Ionicons name="close-circle" size={20} color="red" />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.inputWithIcon}>
              {!input.trim() && !selectedMedia && (
                <TouchableOpacity style={styles.photoIcon} onPress={handleSelectMedia}>
                  <Ionicons name="image-outline" size={20} color="#666" />
                </TouchableOpacity>
              )}
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Type a message..."
                multiline
                style={styles.input}
              />
            </View>
          </View>
          <TouchableOpacity onPress={handleSend} style={styles.sendButton}>
            <Ionicons name="send" size={20} color="white" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      <CommentOptionsModal
        isVisible={isOptionsModalVisible}
        onClose={() => setOptionsModalVisible(false)}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', marginTop: 115 },
  messageList: { padding: 10 },
  inputContainer: { flexDirection: 'row', padding: 10, borderTopWidth: 1, borderColor: '#ccc', backgroundColor: '#fafafa', alignItems: 'flex-end' },
  input: { padding: 10, borderRadius: 20, minHeight: 40, maxHeight: 100 },
  sendButton: { backgroundColor: '#008080', borderRadius: 20, padding: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 30 },
  inputWithIcon: { flex: 1, position: 'relative', justifyContent: 'center' },
  photoIcon: { position: 'absolute', right: 30, top: '30%', transform: [{ translateY: -10 }], zIndex: 1 },
  inputCard: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ccc', borderRadius: 20, padding: 8, marginBottom: 30 },
  previewWrapper: { position: 'relative', marginBottom: 8, borderRadius: 10, overflow: 'hidden', alignSelf: 'flex-start' },
  previewMedia: { width: 120, height: 120, borderRadius: 10, marginBottom: 10 },
  removePreviewButton: { position: 'absolute', top: 5, right: 5, backgroundColor: '#fff', borderRadius: 10, zIndex: 2 },
});

export default MessageThreadScreen;

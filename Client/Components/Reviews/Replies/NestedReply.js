import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import MediaPreview from '../Photos/MediaPreview';
import NestedReplyInputField from './NestedReplyInputField';

const NestedReply = ({
  nestedReplyText,
  setNestedReplyText,
  selectedMedia,
  setSelectedMedia,
  setSelectedEditMedia,
  handleSelectReplyMedia,
  handleAddNestedReply,
}) => {
  const handleClearMedia = () => {
    setSelectedMedia([]);
    setSelectedEditMedia(null);
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputBox}>
        <MediaPreview mediaFiles={selectedMedia} />
        <NestedReplyInputField
          text={nestedReplyText}
          onChangeText={setNestedReplyText}
          onBackspaceClearMedia={handleClearMedia}
          selectedMedia={selectedMedia}
          handleSelectReplyMedia={handleSelectReplyMedia}
        />
      </View>
      <TouchableOpacity style={styles.commentButton} onPress={handleAddNestedReply}>
        <Text style={styles.commentButtonText}>Reply</Text>
      </TouchableOpacity>
    </View>
  );
};

export default NestedReply;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 10,
  },
  inputBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    padding: 8,
    position: 'relative',
    backgroundColor: '#fff',
  },
  commentButton: {
    backgroundColor: '#009999',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
    marginLeft: 5,
  },
  commentButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});

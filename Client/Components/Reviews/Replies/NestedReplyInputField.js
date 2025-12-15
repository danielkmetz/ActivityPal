import React from 'react';
import { TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

const NestedReplyInputField = ({
  text,
  onChangeText,
  onBackspaceClearMedia,
  selectedMedia,
  handleSelectReplyMedia,
}) => {
  return (
    <>
      <TextInput
        style={styles.input}
        placeholder="Write a reply..."
        value={text}
        onChangeText={onChangeText}
        onKeyPress={({ nativeEvent }) => {
          if (
            nativeEvent.key === 'Backspace' &&
            text.trim().length === 0 &&
            selectedMedia.length > 0
          ) {
            onBackspaceClearMedia();
          }
        }}
        multiline
      />
      {text.trim() === '' && selectedMedia.length === 0 && (
        <TouchableOpacity onPress={handleSelectReplyMedia} style={styles.cameraIcon}>
          <FontAwesome name="picture-o" size={18} color="#777" />
        </TouchableOpacity>
      )}
    </>
  );
};

export default NestedReplyInputField;

const styles = StyleSheet.create({
  input: {
    fontSize: 14,
  },
  cameraIcon: {
    position: 'absolute',
    right: 20,
    top: 10,
  },
});

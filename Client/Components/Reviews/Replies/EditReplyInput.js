import React from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Text,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import MediaRenderer from '../Photos/MediaRenderer';

const EditReplyInput = ({
  editedText,
  setEditedText,
  selectedMedia,
  setSelectedMedia,
  setSelectedEditMedia,
  handleSelectReplyMedia,
  onSaveEdit,
  onCancelEdit,
}) => {
  return (
    <>
      <View style={styles.inputWrapper}>
        <View style={styles.fakeInput}>
          <MediaRenderer media={selectedMedia} width={200} height={200} />
          <TextInput
            style={styles.inlineInput}
            value={editedText}
            onChangeText={setEditedText}
            onKeyPress={({ nativeEvent }) => {
              if (
                nativeEvent.key === 'Backspace' &&
                editedText.trim().length === 0 &&
                selectedMedia.length > 0
              ) {
                setSelectedMedia([]);
                setSelectedEditMedia(null);
              }
            }}
            autoFocus
            multiline
            placeholder="Edit your reply..."
          />
        </View>
        <TouchableOpacity onPress={handleSelectReplyMedia} style={styles.mediaIcon}>
          <MaterialCommunityIcons name="image-outline" size={22} color="#009999" />
        </TouchableOpacity>
      </View>

      <View style={styles.editButtonContainer}>
        <TouchableOpacity style={styles.saveButton} onPress={onSaveEdit}>
          <Text style={styles.saveButtonText}>Save</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelButton} onPress={onCancelEdit}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </>
  );
};

export default EditReplyInput;

const styles = StyleSheet.create({
  inputWrapper: {
    marginTop: 8,
  },
  fakeInput: {
    flexDirection: 'column',
    flexWrap: 'wrap',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 6,
    backgroundColor: '#fff',
    minHeight: 50,
  },
  inlineInput: {
    width: '100%',
    fontSize: 14,
    padding: 0,
    margin: 0,
    textAlignVertical: 'top',
    marginTop: 5,
  },
  mediaIcon: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  editButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 5,
  },
  saveButton: {
    backgroundColor: '#009999',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
    marginLeft: 5,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: '#ccc',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
    marginLeft: 5,
  },
  cancelButtonText: {
    color: '#333',
    fontWeight: 'bold',
  },
});

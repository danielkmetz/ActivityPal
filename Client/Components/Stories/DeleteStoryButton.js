import React from 'react';
import { Alert, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { deleteStory } from '../../Slices/StoriesSlice';

const DeleteStoryButton = ({ storyId, onDelete }) => {
  const dispatch = useDispatch();
  const navigation = useNavigation();

  const handleDelete = () => {
    Alert.alert(
      'Delete Story',
      'Are you sure you want to delete this story? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await dispatch(deleteStory(storyId)).unwrap();
              if (onDelete) {
                onDelete();
              } else {
                navigation.goBack();
              }
            } catch (err) {
              console.error('🗑️ Failed to delete story:', err);
            }
          },
        },
      ]
    );
  };

  return (
    <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
      <Ionicons name="trash" size={26} color="white" />
    </TouchableOpacity>
  );
};

export default DeleteStoryButton;

const styles = StyleSheet.create({
  deleteButton: {
    position: 'absolute',
    bottom: 60,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    padding: 10,
  },
});

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import ModalBox from 'react-native-modal';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const CommentOptionsModal = ({
  isVisible,
  onClose,
  onEdit,
  onDelete
}) => (
  <ModalBox isVisible={isVisible} onBackdropPress={onClose} style={styles.bottomModal}>
    <View style={styles.modalContent}>
      <TouchableOpacity onPress={onEdit} style={styles.modalButton}>
        <MaterialCommunityIcons name="pencil-outline" size={20} color="black" />
        <Text style={styles.modalButtonText}>Edit</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onDelete} style={styles.modalButton}>
        <MaterialCommunityIcons name="delete-outline" size={20} color="red" />
        <Text style={styles.modalButtonTextRed}>Delete</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onClose} style={styles.modalCancelButton}>
        <Text style={styles.modalCancelButtonText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  </ModalBox>
);

export default CommentOptionsModal;

const styles = StyleSheet.create({
  bottomModal: {
    justifyContent: 'flex-end',
    margin: 0,
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 15,
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    alignItems: 'center',
  },
  modalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    width: '100%',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalButtonText: {
    fontSize: 16,
    marginLeft: 10,
  },
  modalButtonTextRed: {
    fontSize: 16,
    marginLeft: 10,
    color: 'red',
  },
  modalCancelButton: {
    padding: 15,
    width: '100%',
    alignItems: 'center',
  },
  modalCancelButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007bff',
  },
});

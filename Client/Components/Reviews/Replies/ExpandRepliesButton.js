import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const ExpandRepliesButton = ({ isExpanded, replyCount, onPress }) => {
  return (
    <TouchableOpacity onPress={onPress} style={styles.container}>
      <MaterialCommunityIcons
        name={isExpanded ? 'chevron-up' : 'chevron-down'}
        size={20}
        color="#808080"
      />
      <Text style={styles.text}>
        {replyCount} {replyCount > 1 ? 'replies' : 'reply'}
      </Text>
    </TouchableOpacity>
  );
};

export default ExpandRepliesButton;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    fontSize: 14,
    color: '#888',
  },
});

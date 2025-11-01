import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import StoryAvatar from '../../Stories/StoryAvatar';

export default function InviteHeader({ sender, totalInvited, onPressName }) {
  return (
    <View style={styles.header}>
      <StoryAvatar userId={sender?.id} profilePicUrl={sender?.profilePicUrl} />
      <View style={styles.headerText}>
        <Text style={styles.senderName}>
          <Text onPress={onPressName} style={styles.senderName}>
            {sender?.firstName} {sender?.lastName}
          </Text>
          {` invited ${totalInvited} friend${totalInvited === 1 ? '' : 's'} to a Vybe`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  headerText: { flexDirection: 'column', flexShrink: 1 },
  senderName: { fontWeight: 'bold', fontSize: 16 },
});

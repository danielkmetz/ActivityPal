import React, { memo } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import profilePicPlaceholder from '../../../assets/pics/profile-pic-placeholder.jpg';
import PersonRow from './PersonRow';
import { useSelector } from 'react-redux';
import { selectUser } from '../../../Slices/UserSlice';
import { toId } from '../../../utils/Formatting/toId';

const InviteeTabContent = ({
  selectedTab,
  going = [],
  invited = [],
  declined = [],
  requests = [],
  isSender = false,
  inviteId,
  onAcceptSelf = () => {},
  onDeclineSelf = () => {},
  onAcceptRequest = () => {},
  onRejectRequest = () => {},
  onNudgeRecipient = () => {}, // optional for host nudging
}) => {
  const user = useSelector(selectUser);
  const currentUserId = toId(user?.id || user?._id);

  const renderRecipients = (list, emptyText) =>
    list.length > 0 ? (
      list.map((rec, idx) => (
        <PersonRow
          key={rec?.user?.id || rec?.userId || idx}
          rec={rec}
          currentUserId={currentUserId}
          onAcceptSelf={onAcceptSelf}
          onDeclineSelf={onDeclineSelf}
          // if PersonRow has isHost/onNudge props:
          isHost={isSender}
          onNudge={(recipientId) => onNudgeRecipient(recipientId)}
        />
      ))
    ) : (
      <Text style={styles.emptyText}>{emptyText}</Text>
    );

  return (
    <View>
      {selectedTab === 'going' &&
        renderRecipients(going, 'No one has accepted yet')}

      {selectedTab === 'invited' &&
        renderRecipients(invited, 'No pending invites')}

      {selectedTab === 'declined' &&
        renderRecipients(declined, 'No declines')}

      {selectedTab === 'requested' &&
        (requests.length > 0 ? (
          requests.map((req, idx) => (
            <View key={idx} style={[styles.usersRow, styles.requestRow]}>
              <Image
                source={
                  req.profilePicUrl
                    ? { uri: req.profilePicUrl }
                    : profilePicPlaceholder
                }
                style={styles.profilePic}
              />
              <Text style={styles.userText}>
                {req.firstName} {req.lastName}
              </Text>
              {isSender && (
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnAccept]}
                    onPress={() => onAcceptRequest(req.userId, inviteId)}
                  >
                    <Text style={styles.btnText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnDecline]}
                    onPress={() => onRejectRequest(req.userId, inviteId)}
                  >
                    <Text style={styles.btnText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>No join requests yet</Text>
        ))}
    </View>
  );
};

export default memo(InviteeTabContent);

const styles = StyleSheet.create({
  emptyText: {
    fontSize: 16,
    marginVertical: 2,
    color: '#555',
    paddingLeft: 4,
  },
  usersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },
  requestRow: {
    marginTop: 10,
  },
  profilePic: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 6,
  },
  userText: {
    fontSize: 16,
    color: '#555',
    paddingLeft: 4,
  },
  actions: {
    flexDirection: 'row',
    marginLeft: 10,
  },
  btn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    marginLeft: 10,
  },
  btnAccept: {
    backgroundColor: '#009999',
  },
  btnDecline: {
    backgroundColor: '#808080',
  },
  btnText: {
    color: 'white',
    fontWeight: 'bold',
  },
});

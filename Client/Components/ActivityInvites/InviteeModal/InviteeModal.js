import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableWithoutFeedback,
  Modal,
  Dimensions,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import { acceptInviteRequest, rejectInviteRequest, acceptInvite, rejectInvite } from '../../../Slices/PostsSlice';
import { createNotification, setNotifications, selectNotifications } from '../../../Slices/NotificationsSlice';
import { selectUser } from '../../../Slices/UserSlice';
import { useSelector, useDispatch } from 'react-redux';
import useSlideDownDismiss from '../../../utils/useSlideDown';
import InviteeTabs from './InviteeTabs';
import InviteeTabContent from './InviteeTabContent';
import PersonRow from './PersonRow';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const toId = (v) => (v && v.toString ? v.toString() : v || '');

const InviteeModal = ({ visible, onClose, requests = [], recipients = [], isSender, invite }) => {
  const dispatch = useDispatch();
  const [selectedTab, setSelectedTab] = useState('going');
  const postContent = invite?.original ?? invite ?? {};
  const user = useSelector(selectUser);
  const notifications = useSelector(selectNotifications);
  const going = (recipients || []).filter((r) => r.status === 'accepted');
  const declined = (recipients || []).filter((r) => r.status === 'declined');
  const invited = (recipients || []).filter((r) => r.status === 'pending');
  const counts = {
    invited: invited.length,
    going: going.length,
    declined: declined.length,
    requested: (requests || []).length,
  };

  const { gesture, animateIn, animateOut, animatedStyle } = useSlideDownDismiss(onClose);

  useEffect(() => {
    if (visible) {
      animateIn();
    } else {
      (async () => {
        await animateOut();
        onClose?.();
      })();
    }
  }, [visible]);

  const handleAcceptJoinRequest = async (relatedId, targetId) => {
    try {
      const updatedInvite = await dispatch(
        acceptInviteRequest({ userId: relatedId, inviteId: targetId })
      ).unwrap();

      // Optional: client-side courtesy notification
      await dispatch(
        createNotification({
          userId: relatedId,
          type: 'activityInviteAccepted',
          message: `${user.firstName} ${user.lastName} accepted your request to join the event.`,
          relatedId: user.id,
          typeRef: 'User',
          targetId,
          targetRef: 'Post',     // unified
          postType: 'invite',
        })
      );

      // Clear the "requestInvite" notification for this pair
      const filtered =
        (notifications || []).filter(
          (n) => !(n.type === 'requestInvite' && n.relatedId === relatedId && n.targetId === targetId)
        );
      dispatch(setNotifications(filtered));
    } catch (error) {
      console.error('❌ Error accepting join request:', error);
    }
  };

  const handleRejectJoinRequest = async (relatedId, targetId) => {
    try {
      const updatedInvite = await dispatch(
        rejectInviteRequest({ userId: relatedId, inviteId: targetId })
      ).unwrap();

      await dispatch(
        createNotification({
          userId: relatedId,
          type: 'activityInviteDeclined',
          message: `${user.firstName} ${user.lastName} declined your request to join the event.`,
          relatedId: user.id,
          typeRef: 'User',
          targetId,
          targetRef: 'Post',     // unified
          postType: 'invite',
        })
      );

      const filtered =
        (notifications || []).filter(
          (n) => !(n.type === 'requestInvite' && n.relatedId === relatedId && n.targetId === targetId)
        );
      dispatch(setNotifications(filtered));
    } catch (error) {
      console.error('❌ Error rejecting join request:', error);
    }
  };

  const meId = toId(user?.id || user?._id);

  const doAccept = async () => {
    try {
      await dispatch(acceptInvite({ recipientId: meId, inviteId: postContent._id })).unwrap();
    } catch (e) {
      console.warn('Failed to accept invite:', e?.message || e);
    }
  };

  const doDecline = async () => {
    try {
      await dispatch(rejectInvite({ recipientId: meId, inviteId: postContent._id })).unwrap();
    } catch (e) {
      console.warn('Failed to decline invite:', e?.message || e);
    }
  };

  return (
    <Modal visible={visible} transparent>
      <TouchableWithoutFeedback onPress={animateOut}>
        <View style={styles.overlay}>
          <GestureDetector gesture={gesture}>
            <Animated.View style={[styles.container, animatedStyle]}>
              <View style={styles.notchContainer}>
                {/* removed invalid className prop */}
                <View style={styles.notch} />
              </View>
              <Text style={styles.title}>Who's Going</Text>
              <InviteeTabs selectedTab={selectedTab} onChange={setSelectedTab} counts={counts} />
              <InviteeTabContent
                selectedTab={selectedTab}
                going={going}
                invited={invited}
                declined={declined}
                requests={requests}
                isSender={isSender}
                onAcceptRequest={handleAcceptJoinRequest}
                onRejectRequest={handleRejectJoinRequest}
                inviteId={invite?._id}
                renderPersonRow={(rec, idx) => (
                  <PersonRow
                    key={idx}
                    rec={rec}
                    currentUserId={meId}
                    onAcceptSelf={doAccept}
                    onDeclineSelf={doDecline}
                  />
                )}
              />
            </Animated.View>
          </GestureDetector>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

export default InviteeModal;

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
  container: {
    width: '100%',
    height: SCREEN_HEIGHT * 0.5,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  notchContainer: { alignItems: 'center', marginBottom: 15 },
  notch: { width: 40, height: 5, backgroundColor: '#ccc', borderRadius: 3 },
  title: { fontSize: 20, fontWeight: '600', textAlign: 'center', marginBottom: 10 },
});

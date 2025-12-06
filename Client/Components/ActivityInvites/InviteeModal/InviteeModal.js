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
import { useSelector } from 'react-redux';

import { selectUser } from '../../../Slices/UserSlice';
import useSlideDownDismiss from '../../../utils/useSlideDown';

import InviteeTabs from './InviteeTabs';
import InviteeTabContent from './InviteeTabContent';
import PersonRow from './PersonRow';

// ✅ NEW centralized helper hook (make sure this path matches your project)
import useInviteActions from '../../../utils/UserInviteActions/userInviteActions';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const toId = (v) => (v && v.toString ? v.toString() : v || '');

const InviteeModal = ({
  visible,
  onClose,
  requests = [],
  recipients = [],
  isSender,
  invite,
}) => {
  const [selectedTab, setSelectedTab] = useState('going');

  const user = useSelector(selectUser);
  const meId = toId(user?.id || user?._id);

  const postContent = invite?.original ?? invite ?? {};
  const going = (recipients || []).filter((r) => r.status === 'accepted');
  const declined = (recipients || []).filter((r) => r.status === 'declined');
  const invited = (recipients || []).filter((r) => r.status === 'pending');

  const counts = {
    invited: invited.length,
    going: going.length,
    declined: declined.length,
    requested: (requests || []).length,
  };

  const { gesture, animateIn, animateOut, animatedStyle } =
    useSlideDownDismiss(onClose);

  useEffect(() => {
    if (visible) {
      // slide in when opened
      animateIn();
    } else {
      // slide out then call onClose
      (async () => {
        await animateOut();
        onClose?.();
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // ✅ Use the refactored helper hook; it now runs conflict checks internally
  const {
    acceptForMe,
    declineForMe,
    acceptJoinRequest,
    rejectJoinRequest,
  } = useInviteActions(invite);

  return (
    <Modal visible={visible} transparent>
      <TouchableWithoutFeedback onPress={animateOut}>
        <View style={styles.overlay}>
          <GestureDetector gesture={gesture}>
            <Animated.View style={[styles.container, animatedStyle]}>
              <View style={styles.notchContainer}>
                <View style={styles.notch} />
              </View>

              <Text style={styles.title}>Who's Going</Text>

              <InviteeTabs
                selectedTab={selectedTab}
                onChange={setSelectedTab}
                counts={counts}
              />

              <InviteeTabContent
                selectedTab={selectedTab}
                going={going}
                invited={invited}
                declined={declined}
                requests={requests}
                isSender={isSender}
                // Host accepts / rejects join requests
                onAcceptRequest={(relatedId) => acceptJoinRequest(relatedId)}
                onRejectRequest={(relatedId) => rejectJoinRequest(relatedId)}
                inviteId={postContent?._id || invite?.id}
                renderPersonRow={(rec, idx) => (
                  <PersonRow
                    key={idx}
                    rec={rec}
                    currentUserId={meId}
                    // Self-changing response uses the hook’s handlers
                    // ✅ acceptForMe will run the conflict checker before RSVP
                    onAcceptSelf={acceptForMe}
                    onDeclineSelf={declineForMe}
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
  overlay: {
    flex: 1,
    backgroundColor: '#00000088',
    justifyContent: 'flex-end',
  },
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
  notchContainer: {
    alignItems: 'center',
    marginBottom: 15,
  },
  notch: {
    width: 40,
    height: 5,
    backgroundColor: '#ccc',
    borderRadius: 3,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 10,
  },
});

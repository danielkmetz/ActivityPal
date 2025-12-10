import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableWithoutFeedback, Modal, Dimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import useSlideDownDismiss from '../../../utils/useSlideDown';
import InviteeTabs from './InviteeTabs';
import InviteeTabContent from './InviteeTabContent';
import useInviteActions from '../../../utils/UserInviteActions/userInviteActions';

const SCREEN_HEIGHT = Dimensions.get('window').height;

const InviteeModal = ({
  visible,
  onClose,
  isSender,
  invite,
}) => {
  const [selectedTab, setSelectedTab] = useState('going');
  const postContent = invite?.original ?? invite ?? {};
  const details = postContent?.details;

  const recipients = details?.recipients;
  const requests = details?.requests;
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

  const {
    acceptForMe,
    declineForMe,
    acceptJoinRequest,
    rejectJoinRequest,
    nudgeRecipient,
  } = useInviteActions(invite);

  const inviteId = postContent?._id || invite?.id;

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
                inviteId={inviteId}
                onAcceptSelf={acceptForMe}
                onDeclineSelf={declineForMe}
                // host handling join requests
                onAcceptRequest={(relatedId) => acceptJoinRequest(relatedId)}
                onRejectRequest={(relatedId) => rejectJoinRequest(relatedId)}
                onNudgeRecipient={nudgeRecipient}
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

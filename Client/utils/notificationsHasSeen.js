import AsyncStorage from '@react-native-async-storage/async-storage';

export const markNotificationsSeen = async (unreadCount) => {
  try {
    await AsyncStorage.setItem('@hasSeenNotifications', 'true');
    await AsyncStorage.setItem('@lastSeenUnreadCount', unreadCount.toString());
    } catch (e) {
    console.warn('⚠️ Failed to persist seen state');
  }
};

export const hasSeenNotifications = async (currentUnreadCount) => {
    try {
      const seenValue = await AsyncStorage.getItem('@hasSeenNotifications');
      const lastSeenCountValue = await AsyncStorage.getItem('@lastSeenUnreadCount');
  
      const seen = seenValue === 'true';
      const lastSeenCount = parseInt(lastSeenCountValue || '0', 10);
  
      const isStillSeen = seen && currentUnreadCount <= lastSeenCount;
  
      return isStillSeen;
    } catch (e) {
      console.warn('⚠️ Failed to fetch seen state from AsyncStorage:', e);
      return false;
    }
};

export const decrementLastSeenUnreadCount = async () => {
  try {
    const value = await AsyncStorage.getItem('@lastSeenUnreadCount');
    const count = parseInt(value, 10);

    if (!isNaN(count) && count > 0) {
      const newCount = count - 1;
      await AsyncStorage.setItem('@lastSeenUnreadCount', newCount.toString());
    } else {
      console.log('ℹ️ No need to decrement — value is not a valid positive number.');
    }
  } catch (e) {
    console.warn('⚠️ Failed to decrement lastSeenUnreadCount', e);
  }
};

  
import React, { useEffect, useMemo } from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { selectUser } from '../../Slices/UserSlice';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { fetchLiveNow, selectLiveNow } from '../../Slices/LiveStreamSlice';

const Stories = ({ stories = [] }) => {
  const user = useSelector(selectUser);
  const lives = useSelector(selectLiveNow); // [{ _id, playbackUrl, title, placeId, hostUser? , thumbnailUrl? }]
  const dispatch = useDispatch();
  const navigation = useNavigation();

  useEffect(() => {
    dispatch(fetchLiveNow());
    const t = setInterval(() => dispatch(fetchLiveNow()), 30000);
    return () => clearInterval(t);
  }, [dispatch]);

  const handleViewStory = (storyGroup) => {
    navigation.navigate('StoryViewer', {
      stories: storyGroup.stories,
      startIndex: 0,
    });
  };

  const handleCreateStory = async () => {
    try {
      navigation.navigate('CameraScreen', { mode: 'story' });
    } catch (error) {
      Alert.alert('Camera access failed', 'Unable to open camera for story.');
      console.error('Camera launch failed:', error);
    }
  };

  const handleOpenLive = (liveItem) => {
    // liveItem.liveId corresponds to your LiveStream _id
    navigation.navigate('LivePlayer', { liveId: liveItem.liveId });
  };

  // Map a live stream doc into a tile the Stories list can render
  const mapLiveToTile = (live) => {
    const profilePicUrl =
      live?.hostUser?.profilePicUrl ||
      live?.host?.profilePicUrl ||
      live?.thumbnailUrl || // if you generate thumbs
      null;

    const displayName =
      live?.hostUser?.username ||
      [live?.hostUser?.firstName, live?.hostUser?.lastName].filter(Boolean).join(' ') ||
      live?.title ||
      'Live';

    return {
      _id: `live-${live._id}`,
      type: 'live',
      liveId: live._id,
      title: live.title,
      username: displayName,
      profilePicUrl,
    };
  };

  // Build the rail data: [create] + [live...] + [stories...]
  const data = useMemo(() => {
    const createTile = [{ _id: 'create', type: 'create' }];
    const liveTiles = Array.isArray(lives) ? lives.map(mapLiveToTile) : [];
    return [...createTile, ...liveTiles, ...stories];
  }, [lives, stories]);

  const renderItem = ({ item }) => {
    if (item.type === 'create') {
      return (
        <TouchableOpacity style={styles.storyWrapper} onPress={handleCreateStory}>
          <View style={[styles.circle, { borderColor: '#4caf50' }]}>
            {user?.profilePicUrl ? (
              <Image source={{ uri: user.profilePicUrl }} style={styles.profilePic} />
            ) : (
              <View style={[styles.profilePic, styles.placeholder]}>
                <Ionicons name="camera" size={24} color="#fff" />
              </View>
            )}
          </View>
          <Text style={styles.username} numberOfLines={1}>Your Story</Text>
        </TouchableOpacity>
      );
    }

    if (item.type === 'live') {
      const pic = item.profilePicUrl || 'https://placehold.co/120x120?text=LIVE';
      return (
        <TouchableOpacity style={styles.storyWrapper} onPress={() => handleOpenLive(item)}>
          <View style={[styles.circle, { borderColor: '#e11d48' }]}>
            <Image source={{ uri: pic }} style={styles.profilePic} />
            <View style={styles.liveBadge}><Text style={styles.liveBadgeText}>LIVE</Text></View>
          </View>
          <Text style={styles.username} numberOfLines={1}>
            {item.username || 'Live'}
          </Text>
        </TouchableOpacity>
      );
    }

    // Regular story group (unchanged from your original)
    const { user: storyUser = {}, profilePicUrl, stories: userStories = [] } = item;
    const isViewed = userStories.every((s) => s.isViewed);
    const borderColor = isViewed ? '#ccc' : '#1e90ff';
    const picUrl = storyUser?.profilePicUrl || profilePicUrl;

    return (
      <TouchableOpacity style={styles.storyWrapper} onPress={() => handleViewStory(item)}>
        <View style={[styles.circle, { borderColor }]}>
          <Image source={{ uri: picUrl }} style={styles.profilePic} />
        </View>
        <Text style={styles.username} numberOfLines={1}>
          {`${storyUser?.firstName ?? ''} ${storyUser?.lastName ?? ''}`.trim() || 'User'}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={data}
        keyExtractor={(item) => String(item._id)}
        contentContainerStyle={styles.scrollContainer}
        renderItem={renderItem}
      />
    </View>
  );
};

export default Stories;

const styles = StyleSheet.create({
  container: {
    paddingTop: 10,
    paddingBottom: 5,
    backgroundColor: '#008080',
  },
  scrollContainer: {
    paddingHorizontal: 10,
  },
  storyWrapper: {
    alignItems: 'center',
    marginRight: 15,
    width: 70,
  },
  circle: {
    borderWidth: 2,
    borderRadius: 40,
    padding: 2,
  },
  profilePic: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  placeholder: {
    backgroundColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  username: {
    fontWeight: 'bold',
    marginTop: 2,
    fontSize: 11,
    textAlign: 'center',
  },
  liveBadge: {
    position: 'absolute',
    bottom: -4,
    alignSelf: 'center',
    backgroundColor: '#e11d48',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  liveBadgeText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.5,
  },
});

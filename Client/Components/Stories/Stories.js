import React from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { selectUser } from '../../Slices/UserSlice';
import { useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';

const Stories = ({ stories = [] }) => {
  const user = useSelector(selectUser);
  const navigation = useNavigation();

  const handleViewStory = (stories) => {
    navigation.navigate('StoryViewer', { stories, startIndex: 0 });
  };

  const handleCreateStory = async () => {
    try {
      navigation.navigate('CameraScreen', { mode: 'story' });
    } catch (error) {
      Alert.alert('Camera access failed', 'Unable to open camera for story.');
      console.error('Camera launch failed:', error);
    }
  };

  console.log('stories', stories)

  // 🧠 Group stories by user._id
  const grouped = {};
  stories.forEach((story) => {
    const userId = story.user?.id || story.user?._id;
    if (!userId) return;

    if (!grouped[userId]) grouped[userId] = [];
    grouped[userId].push(story);
  });

  const consolidatedStories = Object.values(grouped).map((group) => {
    const representative = group[0];
    const isShared = representative.type === 'sharedStory';

    return {
      user: representative.user,
      profilePicUrl: isShared
        ? representative.originalOwner?.profilePicUrl || representative.profilePicUrl
        : representative.profilePicUrl,
      stories: group,
      isViewed: group.every((s) => s.isViewed),
      _id: representative.user.id || representative.user._id,
    };
  });

  const storiesWithCreate = [{ _id: 'create', type: 'create' }, ...consolidatedStories];

  console.log(grouped)

  return (
    <View style={styles.container}>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={storiesWithCreate}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.scrollContainer}
        renderItem={({ item }) => {
          if (item.type === 'create') {
            return (
              <TouchableOpacity style={styles.storyWrapper} onPress={handleCreateStory}>
                <View style={[styles.circle, { borderColor: '#4caf50' }]}>
                  {user?.profilePicUrl ? (
                    <Image source={{ uri: user.profilePicUrl }} style={styles.profilePic} />
                  ) : (
                    <View style={[styles.profilePic, { backgroundColor: '#ccc', justifyContent: 'center', alignItems: 'center' }]}>
                      <Ionicons name="camera" size={24} color="#fff" />
                    </View>
                  )}
                </View>
                <Text style={styles.username} numberOfLines={1}>
                  Your Story
                </Text>
              </TouchableOpacity>
            );
          }

          const isViewed = item.isViewed || false;
          const borderColor = isViewed ? '#ccc' : '#1e90ff';

          return (
            <TouchableOpacity style={styles.storyWrapper} onPress={() => handleViewStory(item.stories)}>
              <View style={[styles.circle, { borderColor }]}>
                <Image source={{ uri: item.profilePicUrl }} style={styles.profilePic} />
              </View>
              <Text style={styles.username} numberOfLines={1}>
                {item?.user?.firstName}
              </Text>
            </TouchableOpacity>
          );
        }}
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
  username: {
    fontWeight: 'bold',
    marginTop: 2,
    fontSize: 11,
    textAlign: 'center',
    width: 60,
  },
});

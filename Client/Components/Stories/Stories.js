import React from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { selectUser } from '../../Slices/UserSlice';
import { useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';

const Stories = ({ stories = [] }) => {
  const user = useSelector(selectUser);
  const navigation = useNavigation();

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

  // Prepend the create story item
  const storiesWithCreate = [
    { _id: 'create', type: 'create' },
    ...stories,
  ];

  return (
    <View style={styles.container}>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={storiesWithCreate}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.scrollContainer}
        renderItem={({ item }) => {
          const isCreate = item.type === 'create';

          if (isCreate) {
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

          const { user: storyUser = {}, profilePicUrl, stories: userStories = [] } = item;
          const isViewed = userStories.every((s) => s.isViewed); // Optional, if `isViewed` is removed
          const borderColor = isViewed ? '#ccc' : '#1e90ff';

          return (
            <TouchableOpacity style={styles.storyWrapper} onPress={() => handleViewStory(item)}>
              <View style={[styles.circle, { borderColor }]}>
                <Image source={{ uri: profilePicUrl }} style={styles.profilePic} />
              </View>
              <Text style={styles.username} numberOfLines={1}>
                {`${storyUser?.firstName} ${storyUser?.lastName}` || 'User'}
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
    //width: 60,
  },
});

import React from 'react';
import { View, TouchableWithoutFeedback, StyleSheet } from 'react-native';
import { Avatar } from '@rneui/themed';
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg';
import { useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { selectStories } from '../../Slices/StoriesSlice';

const StoryAvatar = ({ userId, profilePicUrl }) => {
    const navigation = useNavigation();
    const stories = useSelector(selectStories);
    
    const hasUserStories = stories.some((s) => s.user?._id === userId);

    const handleViewUserStory = () => {
        const userStories = stories.filter((s) => s.user?._id === userId);
        if (userStories.length > 0) {
            navigation.navigate('StoryViewer', { stories: userStories, startIndex: 0 });
        }
    };

    return (
        <TouchableWithoutFeedback onPress={handleViewUserStory}>
            <View style={[styles.avatarContainer, hasUserStories && styles.storyBorder]}>
                <Avatar
                    size={45}
                    rounded
                    source={profilePicUrl ? { uri: profilePicUrl } : profilePicPlaceholder}
                    icon={!profilePicUrl ? { name: 'person', type: 'material', color: '#fff' } : null}
                    containerStyle={{ backgroundColor: '#ccc' }}
                />
            </View>
        </TouchableWithoutFeedback>
    );
};

export default StoryAvatar;

const styles = StyleSheet.create({
    avatarContainer: {
        borderRadius: 999,
        marginRight: 5,
    },
    storyBorder: {
        borderWidth: 2,
        borderColor: '#1e90ff',
    },
});

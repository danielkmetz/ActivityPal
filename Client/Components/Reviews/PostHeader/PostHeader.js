import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import StoryAvatar from '../../Stories/StoryAvatar';
import TaggedUsersLine from './TaggedUsersLine';

export default function PostHeader({
    // left side
    item,
    onPressUser,
    onPressBusiness,
    includeAtWithBusiness = false,
    showAtWhenNoTags = false,
    inlineAccessory = null,        // e.g., the small pin icon element
    isSuggestedFollowPost = false, // renders "Suggested user for you" under the line

    // right side
    rightComponent = null,         // e.g., <FollowButton ... />

    // optional style overrides
    containerStyle,
    leftContainerStyle,
}) {
    const authorName = item?.fullName;
    const businessName = item?.businessName;
    const taggedUsers = item?.taggedUsers || [];
    const profilePicUrl = item?.profilePicUrl;
    const userId = item?.userId;

    return (
        <View style={[styles.header, containerStyle]}>
            <View style={[styles.userPicAndName, leftContainerStyle]}>
                <StoryAvatar userId={userId} profilePicUrl={profilePicUrl} />
                <View style={{ flexShrink: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                        <TaggedUsersLine
                            authorId={userId}
                            authorName={authorName}
                            taggedUsers={taggedUsers}
                            businessName={businessName}
                            onPressUser={onPressUser}
                            onPressBusiness={onPressBusiness}
                            includeAtWithBusiness={includeAtWithBusiness}
                            showAtWhenNoTags={showAtWhenNoTags}
                        />
                        {inlineAccessory}
                    </View>
                    {isSuggestedFollowPost && <Text style={styles.subText}>Suggested user for you</Text>}
                </View>
            </View>
            {rightComponent}
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    userPicAndName: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 15,
        padding: 6,
        paddingRight: 30,
        flexShrink: 1,
    },
    subText: {
        color: '#555',
        marginTop: 4,
    },
});

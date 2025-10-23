import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { logEngagementIfNeeded } from '../../../Slices/EngagementSlice';
import { useDispatch } from 'react-redux';

export default function BusinessLink({
    post,
    hitSlop = { top: 6, bottom: 6, left: 6, right: 6 },
}) {
    const dispatch = useDispatch();
    const navigation = useNavigation();
    const postContent = post?.original ? post?.original : post;
    const name = postContent?.businessName;
    const placeId = postContent?.placeId;

    const onPress = () => {
        logEngagementIfNeeded(dispatch, {
            targetType: 'place',
            targetId: placeId,
            placeId,
            engagementType: 'click',
        })
        navigation.navigate("BusinessProfile", { business: postContent });
    };

    if (!name) return null;

    return (
        <TouchableOpacity
            onPress={onPress}
            style={styles.link}
            hitSlop={hitSlop}
            accessibilityRole="button"
            accessibilityLabel={`Open ${name}`}
        >
            <Text style={styles.text} numberOfLines={1}>
                {name}
            </Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    link: { alignSelf: 'flex-start' },
    text: { fontSize: 16, fontWeight: 'bold', color: '#555' },
});

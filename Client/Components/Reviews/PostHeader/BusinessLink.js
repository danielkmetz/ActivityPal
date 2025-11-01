import React from 'react';
import { TouchableOpacity, Text, StyleSheet, Image } from 'react-native';
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
    const logoUrl = postContent?.businessLogoUrl;

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
            {!!logoUrl && <Image source={{ uri: logoUrl }} style={styles.logo} />}
            <Text style={styles.text} numberOfLines={1}>
                {name}
            </Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    link: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', marginTop: 5 },
    text: { fontSize: 16, fontWeight: 'bold', color: '#555' },
    logo: { width: 30, height: 30, borderRadius: 15, marginRight: 10 },
});

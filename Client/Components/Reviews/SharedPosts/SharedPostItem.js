import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import PostActions from '../PostActions/PostActions';
import PostOptionsMenu from '../PostOptionsMenu';
import SharedPostContent from './SharedPostContent';
import NonOwnerOptions from '../PostOptionsMenu/NonOwnerPostOptions';
import PostHeader from '../PostHeader/PostHeader';
import ViewerOptionsTrigger from '../PostOptionsMenu/ViewerOptionsTrigger';

export default function SharedPostItem({
    item,
    photoTapped,
    setPhotoTapped,
    handleOpenComments,
    handleEdit,
    handleDelete,
    onShare,
    embeddedInShared = false,
    ...rest
}) {
    const [dropdownVisible, setDropdownVisible] = useState(false);
    const [viewerOptionsVisible, setViewerOptionsVisible] = useState(false);

    return (
        <View style={styles.sharedCard}>
            <PostOptionsMenu
                dropdownVisible={dropdownVisible}
                setDropdownVisible={setDropdownVisible}
                handleEdit={handleEdit}
                handleDelete={handleDelete}
                postData={item}
            />
            {/* Shared By Header */}
            <PostHeader
                post={item}
                includeAtWithBusiness={false}
                showAtWhenNoTags={false}
            />
            <ViewerOptionsTrigger
                post={item}
                embeddedInShared={embeddedInShared}
                onPress={() => setViewerOptionsVisible(true)}
            />
            {/* Render Shared Content */}
            <View style={{ marginTop: 10 }}>
                <SharedPostContent
                    sharedItem={item}
                    photoTapped={photoTapped}
                    setPhotoTapped={setPhotoTapped}
                    handleEdit={handleEdit}
                    handleDelete={handleDelete}
                    onShare={onShare}
                />
            </View>
            <PostActions
                post={item}
                handleOpenComments={handleOpenComments}
                onShare={onShare}
            />
            <NonOwnerOptions
                visible={viewerOptionsVisible}
                item={item}
                onClose={() => setViewerOptionsVisible(false)}
                isFollowing={true}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    sharedCard: {
        backgroundColor: '#fff',
        borderRadius: 8,
        marginBottom: 16,
        elevation: 3,
    },
    header: {
        padding: 10,
        flexDirection: 'row',
        marginVertical: 10,
    },
    nameAndCaption: {
        marginLeft: 10,
        flex: 1,
        justifyContent: 'center',
    },
    sharedText: {
        fontSize: 16,
        fontWeight: "bold",
        color: "#555",
    },
    name: {
        fontSize: 18,
        fontWeight: "bold",
    },
    caption: {
        fontSize: 16,
        marginTop: 5,
    },
});

import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import EventDetailsCard from "../EventDetailsCard";
import PhotoFeed from '../../Reviews/Photos/PhotoFeed';
import PostActions from "../../Reviews/PostActions";
import { useNavigation } from "@react-navigation/native";

export default function EventPromoItem({
    item,
    selectedTab,                 // "events" | "promotions"
    isDropdownOpen,
    onToggleDropdown,             // (id) => void
    onEdit,                       // (item) => void
    onDelete,                     // (item) => void
    onLikeWithAnimation,          // (item) => void
    onOpenComments,               // (item) => void
    scrollX,
    currentIndexRef,
    setCurrentPhotoIndex,
    lastTapRef,
    onActiveChange = () => { },
    styleOverrides = null,        // if EventDetailsCard expects styles (kept for compatibility)
}) {
    const hasMedia = Array.isArray(item?.photos) && item.photos.length > 0;
    const navigation = useNavigation();
    const selectedType = item?.kind?.toLowerCase().includes('event') ? 'event' : 'promo'

    const onOpenFullScreen = (photo, index) => {
        navigation.navigate('FullScreenPhoto', {
            reviewId: item?._id,
            selectedType,
            initialIndex: item.photos.findIndex(p => p._id === photo._id),
            taggedUsersByPhotoKey: item.taggedUsersByPhotoKey || {},
            isEventPromo: true,
        })
    };

    return (
        <View style={styles.itemCard}>
            {/* Three-dot menu */}
            <View style={styles.menuContainer}>
                <TouchableOpacity onPress={() => onToggleDropdown(item._id)}>
                    <Text style={styles.menuDots}>⋮</Text>
                </TouchableOpacity>
                {isDropdownOpen && (
                    <View style={styles.dropdownMenu}>
                        <TouchableOpacity
                            style={[styles.dropdownItem, styles.editButton]}
                            onPress={() => onEdit(item)}
                        >
                            <Text style={styles.dropdownText}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.dropdownItem, styles.deleteButton]}
                            onPress={() => onDelete(item)}
                        >
                            <Text style={styles.dropdownText}>Delete</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
            <View style={styles.itemInfo}>
                <EventDetailsCard item={item} selectedTab={selectedTab} styles={styleOverrides} />
                {hasMedia && (
                    <PhotoFeed
                        media={item.photos}
                        scrollX={scrollX}
                        currentIndexRef={currentIndexRef}
                        setCurrentPhotoIndex={setCurrentPhotoIndex}
                        reviewItem={item}
                        photoTapped={null}
                        handleLikeWithAnimation={() => onLikeWithAnimation(item)}
                        lastTapRef={lastTapRef}
                        onOpenFullScreen={onOpenFullScreen}
                        onActiveChange={onActiveChange}
                    />
                )}
                <View style={{ paddingLeft: 15 }}>
                    <PostActions
                        item={item}
                        handleLikeWithAnimation={onLikeWithAnimation}
                        handleOpenComments={() => onOpenComments(item)}
                    />
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    itemCard: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        backgroundColor: "#fff",
        borderRadius: 5,
        marginBottom: 10,
        elevation: 2,
        position: "relative",
        paddingBottom: 20,
    },
    itemInfo: { flex: 1 },
    menuContainer: {
        position: "absolute",
        top: 20,
        right: 10,
        zIndex: 10,
    },
    menuDots: { fontSize: 30, color: "#555", paddingHorizontal: 10 },
    dropdownMenu: {
        position: "absolute",
        top: 30,
        right: 0,
        backgroundColor: "#fff",
        padding: 10,
        borderRadius: 10,
        elevation: 20,
        minWidth: 120,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        zIndex: 9999,
    },
    dropdownItem: {
        paddingVertical: 10,
        paddingHorizontal: 15,
        borderRadius: 5,
        marginBottom: 5,
        alignItems: "center",
    },
    editButton: { backgroundColor: "gray" },
    deleteButton: { backgroundColor: "#ff5050" },
    dropdownText: { fontSize: 16, color: "white", fontWeight: "bold" },
});

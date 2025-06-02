import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useDispatch } from 'react-redux';
import { openSearchModal } from '../../Slices/ModalSlice';
import { navigate } from '../../utils/NavigationService';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import SearchModal from '../Home/SearchModal';

export default function Header({ currentRoute }) {
    const dispatch = useDispatch();
    const navigation = useNavigation();

    // Determine dynamic title based on the current route
    const getTitle = () => {
        switch (currentRoute) {
            case "Activities":
                return "Activities";
            case "Home":
                return "Vybe";
            case "Friends":
                return "Friends";
            case "Notifications":
                return "Notifications";
            case "My Events":
                return "My Events";
            case "Reviews":
                return "Reviews";
            case "Insights":
                return "Insights";
            case "CreatePost":
                return "Post";
            case "CreateEvent":
                return "Create Event";
            case "CreatePromotion":
                return "Create Promo";
            default:
                return "Vybe";
        }
    };

    const route = getTitle();

    const handleOpenSearch = () => {
        dispatch(openSearchModal());
    };

    const handleOpenNotifications = () => {
        navigate("Notifications");
    };

    const goBack = () => {
        navigation.goBack();
    };

    return (
        <>
            <View style={styles.header}>
                {/* Title */}
                <View style={styles.headerContent}>
                    {
                        (
                        currentRoute === "Notifications" || 
                        currentRoute === "CreatePost" ||
                        currentRoute === "CreateEvent" ||
                        currentRoute === "CreatePromotion" 
                        ) && (
                        <TouchableOpacity onPress={goBack} style={{marginRight: 10}}>
                            <MaterialCommunityIcons name="chevron-left" size={35} color="black" />
                        </TouchableOpacity>
                    )}
                    <Text style={styles.title}>{route}</Text>
                    <View style={styles.indicators}>
                        {/* Location Display */}
                        <View style={styles.locationContainer}>
                            <TouchableOpacity onPress={handleOpenSearch}>
                                <FontAwesome name="search" size={20} color="white" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleOpenNotifications}>
                                <FontAwesome name="bell" size={20} color="white" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleOpenSearch}>
                                <Image
                                    source={{ uri: 'https://cdn-icons-png.flaticon.com/512/684/684908.png' }} // Pin icon
                                    style={styles.pinIcon}
                                />
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </View>

            <SearchModal />
        </>
    );
}

const styles = StyleSheet.create({
    header: {
        backgroundColor: "#008080",
        paddingHorizontal: 20,
        paddingTop: 70,
    },
    headerContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    title: {
        fontSize: 30,
        color: 'black',
        fontWeight: 'bold',
        fontFamily: "Poppins Bold",
        flex: 1,
    },
    indicators: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    locationContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 17,
    },
    pinIcon: {
        width: 18,
        height: 18,
    },
    locationText: {
        fontSize: 11,
        color: 'white',
        fontWeight: 'bold',
        marginTop: 5,
    },
    smallIcon: {
        width: 18,
        height: 18,
        marginRight: 5,
    },
    icon: {
        width: 25,
        height: 25,
        marginRight: 5,
    },
    overlay: {
        position: 'absolute',
        top: 110,
        right: 20,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        borderRadius: 8,
        padding: 10,
        zIndex: 999,
    },
    dropdown: {
        borderRadius: 8,
        padding: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 4,
        elevation: 5,
    },
    dropdownItem: {
        fontSize: 16,
        paddingVertical: 6,
        color: 'white',
    },
});



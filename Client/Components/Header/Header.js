import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, TextInput } from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { selectWeather, selectCoordinates, selectLocation, fetchWeather } from '../../Slices/LocationSlice';

export default function Header({ currentRoute }) {
    const dispatch = useDispatch();
    const coordinates = useSelector(selectCoordinates);
    const weather = useSelector(selectWeather);
    const location = useSelector(selectLocation);
    
    useEffect(() => {
        if (coordinates) {
            dispatch(fetchWeather(coordinates));
        }
    }, [coordinates]);

    const weatherDescription = weather?.condition?.text || "N/A";
    const weatherIcon = weather?.condition?.icon
        ? `https:${weather.condition.icon}` // Add 'https:' to make it a valid URL
        : null;
    
    // Determine dynamic title based on the current route
    const getTitle = () => {
        switch (currentRoute) {
            case "Activities":
                return "Activities";
            case "Home":
                return "ActivityPal";
            case "Friends":
                return "Friends";
            case "Notifications":
                return "Notifications";
            default:
                return "ActivityPal";
        }
    };

    const route = getTitle();

    return (
        <>
        <View style={styles.header}>
            {/* Title */}
            <View style={styles.headerContent}>
                <Text style={styles.title}>{route}</Text>
                <View style={styles.indicators}>
                {/* Location Display */}
                <View style={styles.locationContainer}>
                    <Image
                        source={{ uri: 'https://cdn-icons-png.flaticon.com/512/684/684908.png' }} // A pin icon URL
                        style={styles.pinIcon}
                    />
                    <Text style={styles.locationText}>{location?.city || "Unknown City"}</Text>
                </View>

                {/* Weather Display */}
                {/* <View style={styles.weatherContainer}>
                    {weatherIcon && (
                        <Image source={{ uri: weatherIcon }} style={styles.weatherIcon} />
                    )}
                    <Text style={styles.weatherText}>
                        {weatherDescription.split(' ')[0]}
                    </Text>
                </View> */}
                </View> 
            </View>
        </View>
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
    // weatherContainer: {
    //     flexDirection: 'column',
    //     alignItems: 'center',
    //     marginLeft: 10,
    // },
    // weatherIcon: {
    //     width: 30,
    //     height: 30,
    // },
    // weatherText: {
    //     fontSize: 12,
    //     color: 'white',
    //     fontWeight: 'bold',
    // },
    locationContainer: {
        flexDirection: 'column',
        alignItems: 'center',
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
});



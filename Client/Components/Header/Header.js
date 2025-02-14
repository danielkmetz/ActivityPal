import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
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
                return "Your Friends";
            case "Notifications":
                return "Notifications";
            default:
                return "ActivityPal";
        }
    };

    const route = getTitle();

    return (
        <View style={styles.header}>
            {/* Location Display */}
            {/* <View style={styles.locationContainer}>
                <Image
                    source={{ uri: 'https://cdn-icons-png.flaticon.com/512/684/684908.png' }} // A pin icon URL
                    style={styles.pinIcon}
                />
                <Text style={styles.locationText}>{location?.city || "Unknown City"}</Text>
            </View> */}

            {/* Weather Display */}
            {/* <View style={styles.weatherContainer}>
                {weatherIcon && (
                    <Image source={{ uri: weatherIcon }} style={styles.weatherIcon} />
                )}
                <Text style={styles.weatherText}>
                    {weatherDescription.split(' ')[0]} {/* Display the first word */}
                {/* </Text> */}
            {/* </View>  */}
            
            {/* Title */}
            <View style={styles.headerContent}>
                <Text style={styles.title}>{route}</Text>
            </View>
            {
                route === "Activites" && (
                    <TouchableOpacity></TouchableOpacity>
                )
            }
        </View>
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
        //justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10,
    },
    title: {
        fontSize: 30,
        color: 'black',
        fontWeight: 'bold',
        fontFamily: "Poppins Bold",
    },
    weatherContainer: {
        position: 'absolute',
        top: 58,
        right: 10,
        flexDirection: 'column',
        alignItems: 'center',
    },
    weatherIcon: {
        width: 40,
        height: 40,
    },
    weatherText: {
        fontSize: 13,
        color: 'white',
        fontWeight: 'bold',
    },
    locationContainer: {
        position: 'absolute',
        top: 70,
        left: 10,
        flexDirection: 'column',
        alignItems: 'center',
    },
    pinIcon: {
        width: 20,
        height: 20,
    },
    locationText: {
        fontSize: 12,
        color: 'white',
        fontWeight: 'bold',
        marginTop: 5,
    },
});



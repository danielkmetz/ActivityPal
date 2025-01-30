import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Dimensions, Text, ScrollView, Modal } from 'react-native';
import { useSelector } from 'react-redux';
import { selectCoordinates } from '../../Slices/LocationSlice';
import MapView, { Marker } from 'react-native-maps';

const apiKey = ***REMOVED***;
const { width, height } = Dimensions.get('window');

export default function Map() {
    const [isExpanded, setIsExpanded] = useState(false);
    const coordinates = useSelector(selectCoordinates);

    const handlePress = () => {
        setIsExpanded(true); // Show expanded map
    };

    const handleClose = () => {
        setIsExpanded(false); // Close expanded map
    };

    if (!coordinates) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#0000ff" />
            </View>
        );
    }

    const { lat, lng } = coordinates;

    return (
        <ScrollView contentContainerStyle={styles.scrollContainer}>
            <View style={styles.container}>
                {/* Non-expanded map view */}
                {!isExpanded && (
                    <View style={styles.smallContainer}>
                        <Text style={styles.title}>Trending near me</Text>
                        <TouchableOpacity onPress={handlePress}>
                            <Image
                                source={{
                                    uri: `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=15&size=400x400&markers=color:red%7C${lat},${lng}&key=${apiKey}`
                                }}
                                style={styles.image}
                            />
                        </TouchableOpacity>
                    </View>
                )}

                {/* Expanded map view in a Modal */}
                <Modal
                    visible={isExpanded}
                    animationType="slide"
                    transparent={false}
                >
                    <View style={styles.expandedContainer}>
                        <MapView
                            style={styles.map}
                            region={{
                                latitude: lat,
                                longitude: lng,
                                latitudeDelta: 0.01,
                                longitudeDelta: 0.01,
                            }}
                        >
                            <Marker 
                                coordinate={{
                                    latitude: lat,
                                    longitude: lng,
                                }}
                                title="Current Location"
                            />
                        </MapView>
                        <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
                            <Text style={styles.closeButtonText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </Modal>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scrollContainer: {
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 10,
    },
    container: {
        flex: 1,
        alignItems: 'center',
    },
    smallContainer: {
        width: width * 0.95,
        height: 200,
        borderRadius: 10,
        overflow: 'hidden',
    },
    expandedContainer: {
        flex: 1,
        backgroundColor: 'white',
        justifyContent: 'center',
        alignItems: 'center',
    },
    map: {
        width: '100%',
        height: '100%',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeButton: {
        position: 'absolute',
        top: 40,
        right: 20,
        backgroundColor: 'rgba(0,0,0,0.6)',
        padding: 10,
        borderRadius: 8,
    },
    closeButtonText: {
        color: '#fff',
        fontSize: 16,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: 'black',
        marginBottom: 10,
        textAlign: 'left',
    }
});

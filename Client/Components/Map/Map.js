import React, { useRef, useState, } from 'react';
import { View, StyleSheet, ActivityIndicator, Dimensions, Text, TouchableOpacity } from 'react-native';
import { useSelector } from 'react-redux';
import { selectCoordinates } from '../../Slices/LocationSlice';
import MapView, { Marker } from 'react-native-maps';
import MapCardCarousel from './MapCardCarousel';

const { width, height } = Dimensions.get('window');

export default function Map({ activities = [], onEndReached, loadingMore }) {
    const coordinates = useSelector(selectCoordinates);
    const [activePlaceId, setActivePlaceId] = useState(null);
    const [zoomLevel, setZoomLevel] = useState(0.01);
    const [zoomRegion, setZoomRegion] = useState({
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
    });

    const mapRef = useRef(null);
    const markerRefs = useRef({});
    const carouselRef = useRef();
    const { lat, lng } = coordinates;

    const handleCardPress = (location, placeId) => {
        setActivePlaceId(placeId);

        if (mapRef.current && location?.lat && location?.lng) {
            mapRef.current.animateToRegion({
                latitude: location.lat - 0.001,
                longitude: location.lng,
                latitudeDelta: 0.007,
                longitudeDelta: 0.007,
            }, 1000);

            const markerRef = markerRefs.current[placeId];
            if (markerRef) {
                setTimeout(() => markerRef.showCallout(), 1100);
            } else {
                console.log(`❌ Marker ref not found for: ${placeId}`);
            }
        }
    };

    const handleMarkerPress = (placeId, index) => {
        setActivePlaceId(placeId);

        if (carouselRef.current) {
            carouselRef.current.scrollToIndex({ index, animated: true });
        }
    };

    const getZoomCenter = () => {
        if (activePlaceId) {
            const active = activities.find(a => a.place_id === activePlaceId);
            if (active?.location) {
                return {
                    latitude: active.location.lat,
                    longitude: active.location.lng
                };
            }
        }
        return { latitude: lat, longitude: lng }; // fallback to user location
    };

    const handleZoomIn = () => {
        const newLatitudeDelta = zoomRegion.latitudeDelta / 2;
        const newLongitudeDelta = zoomRegion.longitudeDelta / 2;

        const center = getZoomCenter(); // 👈 get selected marker if available
        animateZoom(newLatitudeDelta, newLongitudeDelta, center);
    };

    const handleZoomOut = () => {
        const newLatitudeDelta = zoomRegion.latitudeDelta * 2;
        const newLongitudeDelta = zoomRegion.longitudeDelta * 2;

        const center = getZoomCenter();
        animateZoom(newLatitudeDelta, newLongitudeDelta, center);
    };

    const animateZoom = (latitudeDelta, longitudeDelta, center = { latitude: lat, longitude: lng }) => {
        if (mapRef.current) {
            mapRef.current.animateToRegion({
                latitude: center.latitude,
                longitude: center.longitude,
                latitudeDelta,
                longitudeDelta,
            }, 300);
        }
    };

    if (!coordinates) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#0000ff" />
            </View>
        );
    };

    return (
        <View style={styles.mapContainer}>
            <View style={styles.zoomControls}>
                <TouchableOpacity onPress={handleZoomIn} style={styles.zoomButton}>
                    <Text style={styles.zoomText}>＋</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleZoomOut} style={styles.zoomButton}>
                    <Text style={styles.zoomText}>－</Text>
                </TouchableOpacity>
            </View>
            <MapView
                style={styles.map}
                ref={mapRef}
                initialRegion={{
                    latitude: lat - 0.002,
                    longitude: lng,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                }}
                onRegionChangeComplete={(region) => {
                    setZoomRegion({
                        latitudeDelta: region.latitudeDelta,
                        longitudeDelta: region.longitudeDelta,
                    });
                }}
            >
                <Marker
                    coordinate={{
                        latitude: lat,
                        longitude: lng,
                    }}
                    pinColor="red"
                    title="You are here"
                />

                {activities.map((activity, index) => {
                    const location = activity?.location;
                    if (!location) return null;

                    const isActive = activePlaceId === activity.place_id;

                    return (
                        <Marker
                            ref={(ref) => {
                                if (ref && activity.place_id) {
                                    markerRefs.current[activity.place_id] = ref;
                                }
                            }}
                            key={activity.place_id || index}
                            onPress={() => handleMarkerPress(activity.place_id, index)}
                            coordinate={{
                                latitude: location.lat,
                                longitude: location.lng,
                            }}
                            trackViewChanges={isActive}
                            calloutAnchor={{ x: 0.5, y: 0 }}
                        >
                            <View style={{ alignItems: 'center', height: 60, justifyContent: 'flex-end' }}>
                                <View style={[styles.floatingContainer, { opacity: isActive ? 1 : 0 }]}>
                                    <View style={styles.floatingLabel}>
                                        <Text style={styles.calloutName}>{activity.name}</Text>
                                    </View>
                                    <View style={styles.pointer} />
                                </View>

                                <View style={styles.markerPin}>
                                    <View style={[
                                        styles.pinHead,
                                        activePlaceId === activity.place_id && styles.activePinHead,
                                    ]}>
                                        <Text style={styles.markerText}>{index + 1}</Text>
                                    </View>
                                    <View style={[
                                        styles.pinTail,
                                        activePlaceId === activity.place_id && styles.activePinTail,
                                    ]} />
                                </View>
                            </View>
                        </Marker>
                    );
                })}
            </MapView>

            <MapCardCarousel
                activities={activities}
                onCardPress={handleCardPress}
                carouselRef={carouselRef}
                onEndReached={onEndReached}
                loadingMore={loadingMore}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    mapContainer: {
        flex: 1,
        position: 'relative',
    },
    map: {
        width: width,
        height: height,
        paddingBottom: 150,
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
    },
    markerPin: {
        alignItems: 'center',
    },
    pinHead: {
        width: 26,
        height: 26,
        backgroundColor: '#9E9E9E',
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2,
        shadowColor: '#000',
        shadowOpacity: 0.3,
    },
    pinTail: {
        width: 0,
        height: 0,
        borderLeftWidth: 8,
        borderRightWidth: 8,
        borderTopWidth: 12,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: '#9E9E9E',
        marginTop: -3,
        zIndex: 1,
    },
    markerText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
        textAlign: 'center'
    },
    floatingContainer: {
        marginBottom: 10,
        zIndex: 999,
    },
    floatingLabel: {
        backgroundColor: 'white',
        padding: 8,
        borderRadius: 8,
        maxWidth: 220,
        elevation: 4,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 4,
    },
    calloutName: {
        fontWeight: 'bold',
        fontSize: 14,
        color: '#333',
    },
    pointer: {
        width: 0,
        height: 0,
        borderLeftWidth: 6,
        borderRightWidth: 6,
        borderTopWidth: 8,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: 'white',
        marginTop: -1,
        alignSelf: 'center',
    },
    activePinHead: {
        backgroundColor: '#2196F3',
    },
    activePinTail: {
        borderTopColor: '#2196F3',
    },
    zoomControls: {
        position: 'absolute',
        top: 40,
        right: 20,
        flexDirection: 'column',
        gap: 8,
        backgroundColor: 'transparent',
        zIndex: 1000,
    },
    zoomButton: {
        backgroundColor: 'white',
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 4,
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 4,
    },
    zoomText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#333',
    },

});

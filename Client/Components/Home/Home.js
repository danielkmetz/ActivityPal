import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Image, Text } from 'react-native';
import homeImage from '../../assets/pics/home_pic.webp';
import heart from '../../assets/pics/heart.png';
import tableware from '../../assets/pics/tableware.webp';
import tickets from '../../assets/pics/tickets.png'; 
import PreferencesModal from '../Preferences/Preferences';
import Map from '../Map/Map';

function Home() {
    const [modalVisible, setModalVisible] = useState(false);
    
    const handlePress = () => {
        setModalVisible(true);
    };

    return (
        <View>
            <TouchableOpacity onPress={handlePress} style={styles.imageContainer}>
                <Image 
                    source={homeImage} 
                    style={styles.image} 
                />
                <Text style={styles.imageText}>Find what fits my vibe</Text>
            </TouchableOpacity>

            {/* Quick Filter Icons */}
            <View style={styles.filterContainer}>
                <View style={styles.filterItem}>
                    <Text style={styles.filterText}>Date Night</Text>
                    <Image source={heart} style={styles.filterIcon} />
                </View>
                <View style={styles.filterItem}>
                    <Text style={styles.filterText}>Drinks & Dining</Text>
                    <Image source={tableware} style={styles.filterIcon} />
                </View>
                <View style={styles.filterItem}>
                    <Text style={styles.filterText}>Events</Text>
                    <Image source={tickets} style={styles.filterIcon} />
                </View>
            </View>

            <Map />
            {/* Preferences Modal */}
            <PreferencesModal visible={modalVisible} onClose={() => setModalVisible(false)} />
        </View>
    );
};

export default Home;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'flex-start',
        alignItems: 'center',
        paddingTop: 20,
    },
    imageContainer: {
        width: '100%',
        height: 200,
        marginBottom: 20,
        borderRadius: 10,
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 140,
    },
    image: {
        width: '100%',
        height: '100%',
    },
    imageText: {
        position: 'absolute',
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
        textAlign: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        padding: 5,
    },
    filterContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        marginBottom: 30,
        marginTop: 30,
        paddingHorizontal: 10,
    },
    filterItem: {
        alignItems: 'center',
    },
    filterIcon: {
        width: 50,
        height: 50,
        marginBottom: 5,
    },
    filterText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: 'black',
        marginBottom: 7,
    },
});

const pickerSelectStyles = StyleSheet.create({
    inputIOS: {
        fontSize: 16,
        paddingVertical: 12,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderColor: 'gray',
        borderRadius: 4,
        color: 'black',
        paddingRight: 30,
        marginTop: 30,
    },
    inputAndroid: {
        fontSize: 16,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderWidth: 0.5,
        borderColor: 'gray',
        borderRadius: 4,
        color: 'black',
        paddingRight: 30,
    },
});



import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const BottomNavigation = ({
    onOpenPreferences,
    onOpenFilter,
    categoryFilter,
    isMapView,
    onToggleMapView,
    onClear,
}) => {
    return (
        <View style={styles.bottomNav}>
            <TouchableOpacity style={styles.navButton} onPress={onOpenPreferences}>
                <Text style={styles.navButtonText}>Preferences</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.navButton} onPress={onOpenFilter}>
                <Text style={styles.navButtonText}>
                    {categoryFilter ? `Filter: ${categoryFilter.replace(/_/g, ' ')}` : 'Filter'}
                </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.navButton} onPress={onToggleMapView}>
                <Text style={styles.navButtonText}>
                    {isMapView ? 'List View' : 'Map View'}
                </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.navButton} onPress={onClear}>
                <Text style={styles.navButtonText}>Clear</Text>
            </TouchableOpacity>
        </View>
    );
};

export default BottomNavigation;

const styles = StyleSheet.create({
    bottomNav: {
        height: 60,
        flexDirection: 'row',
        backgroundColor: '#008080',
        borderTopWidth: 1,
        borderTopColor: '#ddd',
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        alignItems: 'center',
        paddingHorizontal: 10,
        marginBottom: 35,
    },    
    navButton: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    navButtonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 14,
        textAlign: 'center',
    },
});

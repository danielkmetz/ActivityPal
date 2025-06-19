import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    FlatList,
    StyleSheet,
    Dimensions,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { setCategoryFilter, selectCategoryFilter } from '../../Slices/PaginationSlice';
import { useRoute } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';

const CUISINES = [
    { key: 'bar_food', label: 'Bar Food', icon: 'beer', library: 'MaterialCommunityIcons' },
    { key: 'sushi', label: 'Sushi', icon: 'restaurant', library: 'Ionicons' },
    { key: 'ramen', label: 'Ramen', icon: 'noodles', library: 'MaterialCommunityIcons' },
    { key: 'chinese', label: 'Chinese', icon: 'noodles', library: 'MaterialCommunityIcons' },
    { key: 'italian', label: 'Italian', icon: 'pasta', library: 'MaterialCommunityIcons' },
    { key: 'indian', label: 'Indian', icon: 'food', library: 'MaterialCommunityIcons' },
    { key: 'mediterranean', label: 'Mediterranean', icon: 'food', library: 'MaterialCommunityIcons' },
    { key: 'thai', label: 'Thai', icon: 'food', library: 'MaterialCommunityIcons' },
    { key: 'mexican', label: 'Mexican', icon: 'taco', library: 'MaterialCommunityIcons' },
    { key: 'breakfast', label: 'Breakfast', icon: 'egg', library: 'MaterialCommunityIcons' },
];

const PLACES = [
    { key: 'romantic', label: 'Romantic', icon: 'heart-outline', library: 'MaterialCommunityIcons' },
    { key: 'fine_dine', label: 'Fine Dine', icon: 'silverware-fork-knife', library: 'MaterialCommunityIcons' },
    { key: 'live_music', label: 'Live Music', icon: 'music-note', library: 'MaterialIcons' },
    { key: 'open_air', label: 'Open Air', icon: 'weather-sunny', library: 'MaterialCommunityIcons' },
    { key: 'just_coffee', label: 'Coffee & Tea', icon: 'coffee', library: 'MaterialCommunityIcons' },
    { key: 'quick_bites', label: 'Quick Bites', icon: 'fastfood', library: 'MaterialIcons' },
    { key: 'late_night', label: 'Late Night', icon: 'moon', library: 'Ionicons' },
    { key: 'dj_parties', label: 'DJ Parties', icon: 'music-circle', library: 'MaterialCommunityIcons' },
];

const SORT_OPTIONS = [
    { key: 'distance', label: 'Distance (Default)' },
    { key: 'rating', label: 'Highest Rated' },
    { key: 'popularity', label: 'Most Popular' },
    { key: 'priceLowHigh', label: 'Price: Low to High' },
    { key: 'priceHighLow', label: 'Price: High to Low' },
    { key: 'serviceRating', label: 'Best Service' },
    { key: 'wouldRecommend', label: 'Most Recommended' },
];

const FilterSortScreen = () => {
    const route = useRoute();
    const navigation = useNavigation();
    const dispatch = useDispatch();
    const categoryFilter = useSelector(selectCategoryFilter);
    const [mode, setMode] = useState('cuisine'); // or 'place'
    const [selected, setSelected] = useState(new Set(categoryFilter || []));
    const { availableCuisines = [] } = route.params || {};
    const filteredCuisines = CUISINES.filter(c => availableCuisines.includes(c.key));
    const options = mode === 'cuisine'
        ? filteredCuisines
        : mode === 'place'
            ? PLACES
            : SORT_OPTIONS;

    const handleApplyFilters = () => {
        dispatch(setCategoryFilter(Array.from(selected)));
        navigation.navigate("Activities");
    };

    const handleSelection = (itemKey) => {
        const newSet = new Set(selected);
        if (newSet.has(itemKey)) {
            newSet.delete(itemKey);
        } else {
            newSet.add(itemKey);
        }
        setSelected(newSet);
    };

    const handleReset = () => {
        dispatch(setCategoryFilter(null));
        setSelected(new Set());
        navigation.navigate("Activities");
    };

    const paddedOptions = [...options, { key: 'placeholder-1', placeholder: true }, { key: 'placeholder-2', placeholder: true }];

    return (
        <View style={styles.container}>
            {/* Mode switch */}
            <View style={styles.switchContainer}>
                {['cuisine', 'place', 'sort'].map(tab => (
                    <TouchableOpacity
                        key={tab}
                        onPress={() => setMode(tab)}
                        style={[styles.switchButton, mode === tab && styles.switchActive]}
                    >
                        <Text style={styles.switchText}>
                            {tab === 'cuisine' ? 'Cuisine' : tab === 'place' ? 'Place' : 'Sort'}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <FlatList
                data={paddedOptions}
                keyExtractor={(item) => item.key}
                numColumns={3}
                contentContainerStyle={styles.grid}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => {
                    if (item.placeholder) {
                        return <View style={[styles.tile, { backgroundColor: 'transparent' }]} />;
                    }
                    const isActive = selected.has(item.key);
                    return (
                        <TouchableOpacity
                            onPress={() => handleSelection(item.key)}
                            style={[styles.tile, isActive && styles.tileActive]}
                        >
                            {item.icon && item.library && mode !== 'sort' && (
                                item.library === 'Ionicons' ? (
                                    <Ionicons name={item.icon} size={28} color={isActive ? '#fff' : '#555'} />
                                ) : item.library === 'MaterialCommunityIcons' ? (
                                    <MaterialCommunityIcons name={item.icon} size={28} color={isActive ? '#fff' : '#555'} />
                                ) : item.library === 'MaterialIcons' ? (
                                    <MaterialIcons name={item.icon} size={28} color={isActive ? '#fff' : '#555'} />
                                ) : null
                            )}
                            <Text style={[styles.tileText, isActive && styles.tileTextActive]}>
                                {item.label}
                            </Text>
                        </TouchableOpacity>
                    );
                }}
            />

            <View style={styles.footer}>
                <TouchableOpacity onPress={() => handleReset()} style={styles.resetButton}>
                    <Text style={styles.resetText}>Reset</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={handleApplyFilters}
                    style={styles.applyButton}
                >
                    <Text style={styles.applyText}>Apply Filters</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

export default FilterSortScreen;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff', paddingTop: 60, paddingHorizontal: 16, marginTop: 115, },
    header: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
    switchContainer: { flexDirection: 'row', justifyContent: 'center', marginBottom: 20 },
    switchButton: {
        paddingVertical: 8,
        paddingHorizontal: 20,
        marginHorizontal: 5,
        borderRadius: 20,
        backgroundColor: '#eee',
    },
    switchActive: {
        backgroundColor: '#d32f2f',
    },
    switchText: {
        color: '#fff',
        fontWeight: '600',
    },
    grid: {
        paddingBottom: 100,
    },
    tile: {
        flex: 1,
        flexBasis: '30%',
        aspectRatio: 1,
        backgroundColor: '#f2f2f2',
        margin: 6,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    tileText: {
        textAlign: 'center',
    },
    tileActive: {
        backgroundColor: '#000000',
    },
    tileTextActive: {
        color: '#fff',
        fontWeight: 'bold',
    },
    footer: {
        position: 'absolute',
        bottom: 30,
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
    },
    resetButton: {
        padding: 12,
        backgroundColor: '#aaa',
        borderRadius: 10,
    },
    resetText: {
        color: '#fff',
        fontWeight: '600',
    },
    applyButton: {
        padding: 12,
        backgroundColor: '#d32f2f',
        borderRadius: 10,
    },
    applyText: {
        color: '#fff',
        fontWeight: '600',
    },
});

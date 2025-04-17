// Components/QuickFilters/QuickFilters.js
import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Image,
    StyleSheet
} from 'react-native';

const QuickFilters = ({ keyboardOpen, onFilterPress, stylesOverride = {}, icons }) => {
    const filters = [
        { label: "Date Night", icon: icons.heart, type: "dateNight" },
        { label: "Drinks & Dining", icon: icons.tableware, type: "drinksAndDining" },
        { label: "Events", icon: icons.tickets, type: "events" },
        { label: "Outdoor", icon: icons.hiking, type: "outdoor" },
        { label: "Movie Night", icon: icons.popcorn, type: "movieNight" },
        { label: "Gaming", icon: icons.arcade, type: "gaming" },
        { label: "Art & Culture", icon: icons.art, type: "artAndCulture" },
        { label: "Family Fun", icon: icons.family, type: "familyFun" },
        { label: "Pet Friendly", icon: icons.dog, type: "petFriendly" },
        { label: "Live Music", icon: icons.microphone, type: "liveMusic" },
        { label: "What's Close", icon: icons.map, type: "whatsClose" },
    ];

    return (
        <>
            <Text style={[styles.filterTitle, stylesOverride.filterTitle]}>Quick Filters</Text>
            <View style={[styles.filterContainer, stylesOverride.filterContainer]}>
                {filters.map(({ label, icon, type }) => (
                    <TouchableOpacity
                        key={type}
                        style={[
                            styles.filterItem,
                            keyboardOpen && styles.disabledFilter,
                            stylesOverride.filterItem
                        ]}
                        onPress={() => !keyboardOpen && onFilterPress(type)}
                        disabled={keyboardOpen}
                    >
                        <Text style={[styles.filterText, stylesOverride.filterText]}>{label}</Text>
                        <Image source={icon} style={[styles.filterIcon, stylesOverride.filterIcon]} />
                    </TouchableOpacity>
                ))}
            </View>
        </>
    );
};

export default QuickFilters;

const styles = StyleSheet.create({
    filterTitle: {
        fontSize: 20,
        marginLeft: 30,
        fontFamily: 'Poppins Bold',
        marginTop: 30,
    },
    filterContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-around',
        alignItems: 'center',
        marginBottom: 30,
        marginTop: 30,
        paddingHorizontal: 10,
    },
    filterItem: {
        alignItems: 'center',
        width: '30%',
        marginBottom: 15,
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
        textAlign: 'center',
    },
    disabledFilter: {
        opacity: 0.5,
    },
});

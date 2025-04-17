// Components/SearchBar/SearchBar.js
import React from 'react';
import {
    View,
    Text,
    Image,
    TouchableOpacity,
    StyleSheet
} from 'react-native';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';

const SearchBar = ({ lat, lng, onSelectPlace, fetchPlaceImage, placeImages, GOOGLE_API_KEY }) => {
    return (
        <View style={styles.searchContainer}>
            <GooglePlacesAutocomplete
                placeholder="Search places..."
                query={{
                    key: GOOGLE_API_KEY,
                    language: "en",
                    types: "establishment",
                    location: lat && lng ? `${lat},${lng}` : null,
                    rankby: "distance",
                }}
                fetchDetails={true}
                onFail={(error) => console.log("Google Places Error:", error)}
                styles={{
                    textInput: styles.searchInput,
                    listView: styles.listView,
                }}
                renderRow={(data) => {
                    const placeId = data?.place_id;
                    const terms = data?.terms;

                    const city = terms?.[2]?.value || "Unknown City";
                    const state = terms?.[3]?.value || "Unknown State";

                    if (placeId && !placeImages[placeId]) {
                        fetchPlaceImage(placeId);
                    }

                    const imageUrl = placeImages[placeId];

                    return (
                        <TouchableOpacity onPress={() => onSelectPlace(data)}>
                            <View style={styles.row}>
                                {imageUrl && (
                                    <Image source={{ uri: imageUrl }} style={styles.placeImage} />
                                )}
                                <View>
                                    <Text style={styles.placeText}>{data.structured_formatting.main_text}</Text>
                                    <Text style={styles.cityStateText}>{city}, {state}</Text>
                                </View>
                            </View>
                        </TouchableOpacity>
                    );
                }}
            />
        </View>
    );
};

export default SearchBar;

const styles = StyleSheet.create({
    searchContainer: {
        flexDirection: 'row',
        width: '100%',
        alignSelf: 'center',
    },
    searchInput: {
        flex: 1,
        height: 40,
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 15,
        paddingHorizontal: 10,
        backgroundColor: 'white',
    },
    listView: {
        position: "absolute",
        top: 50,
        backgroundColor: "#fff",
        zIndex: 1000,
        width: "100%",
        borderRadius: 10,
        elevation: 4,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        padding: 10,
        backgroundColor: "#fff",
        borderBottomWidth: 1,
        borderBottomColor: "#eee",
    },
    placeImage: {
        width: 40,
        height: 40,
        borderRadius: 5,
        marginRight: 10,
    },
    placeText: {
        fontSize: 16,
        color: "#333",
    },
    cityStateText: {
        fontSize: 12,
        color: "#777",
    },
});

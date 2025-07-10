import React, { useEffect } from "react";
import { View, Text, FlatList, ActivityIndicator, StyleSheet, TouchableOpacity, Image, Dimensions } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { fetchFavoritedDetails, selectFavoritedDetails, selectFavoritesStatus } from "../../Slices/FavoritesSlice";
import { useNavigation } from "@react-navigation/native";

const SCREEN_WIDTH = Dimensions.get("window").width;

export default function Favorites({ favorites }) {
    const dispatch = useDispatch();
    const navigation = useNavigation();
    const favoritedDetails = useSelector(selectFavoritedDetails);
    const status = useSelector(selectFavoritesStatus);

    useEffect(() => {
        if (favorites.length > 0) {
            dispatch(fetchFavoritedDetails(favorites));
        }
    }, [favorites]);

    if (status === "loading") {
        return <ActivityIndicator size="large" color="#007bff" />;
    }

    if (status === "failed") {
        return <Text style={styles.errorText}>Error fetching favorites.</Text>;
    }

    return (
        <View style={styles.container}>
            <FlatList
                data={favoritedDetails}
                keyExtractor={(item) => item._id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.flatListContent}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={styles.businessCard}
                        onPress={() => navigation.navigate("BusinessProfile", { business: item })}
                    >
                        <Image
                            source={item.profilePicUrl ? { uri: item.profilePicUrl } : require("../../assets/pics/business-placeholder.png")}
                            style={styles.businessImage}
                        />
                        <View style={styles.textContainer}>
                            <Text style={styles.businessName}>{item?.businessName}</Text>
                            <Text style={styles.location}>{item?.location?.formattedAddress}</Text>
                        </View>
                    </TouchableOpacity>
                )}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        marginTop: 10,
        width: "100%",
    },
    flatListContent: {
        paddingHorizontal: 10,
        paddingBottom: 20, // Adds space at the bottom
    },
    businessCard: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#fff",
        padding: 10,
        borderRadius: 8,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
        width: SCREEN_WIDTH * 0.95, // Takes up most of the screen width
        alignSelf: "center", // Centers the cards
        marginBottom: 10, // Space between cards
    },
    businessImage: {
        width: 50,
        height: 50,
        borderRadius: 25,
        marginRight: 10,
    },
    textContainer: {
        flex: 1,
    },
    businessName: {
        fontSize: 16,
        fontWeight: "bold",
    },
    location: {
        fontSize: 14,
        color: "gray",
    },
    errorText: {
        color: "red",
        textAlign: "center",
        marginTop: 10,
    },
});

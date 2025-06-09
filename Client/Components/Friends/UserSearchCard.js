import React from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import SuggestedFriendsCard from './SuggestedFriendsCard';
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg';

export default function UserSearchCard({ query, onChangeQuery, results, onUserSelect }) {
    return (
        <>
            <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>Search Users</Text>
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search for users..."
                    value={query}
                    onChangeText={onChangeQuery}
                />
                {query.trim().length > 0 ? (
                    results?.length > 0 ? (
                        <FlatList
                            data={results}
                            keyExtractor={(item) => item._id}
                            renderItem={({ item }) => (
                                <TouchableOpacity style={styles.suggestionContainer} onPress={() => onUserSelect(item)}>
                                    <View style={styles.suggestionRow}>
                                        <Image
                                            source={
                                                item.presignedProfileUrl ? 
                                                { uri: item.presignedProfileUrl } : 
                                                profilePicPlaceholder
                                            }
                                            style={styles.pic}
                                        />
                                        <Text>{item.firstName} {item.lastName}</Text>
                                    </View>
                                    <FontAwesome name="arrow-right" size={24} color="#007bff" />
                                </TouchableOpacity>
                            )}
                        />
                    ) : (
                        <Text style={styles.emptyText}>No users found</Text>
                    )
                ) : null}
            </View>
            <SuggestedFriendsCard
                onSelectUser={onUserSelect}
            />
        </>
    );
}

const styles = StyleSheet.create({
    sectionContainer: {
        marginBottom: 16,
        padding: 16,
        backgroundColor: '#fff',
        borderRadius: 8,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    searchInput: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        padding: 8,
        marginBottom: 16,
    },
    suggestionContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    suggestionRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    emptyText: {
        color: '#aaa',
        textAlign: 'center',
        marginTop: 8,
    },
    pic: {
        width: 36,
        height: 36,
        borderRadius: 18,
        marginRight: 12,
    },
      
});

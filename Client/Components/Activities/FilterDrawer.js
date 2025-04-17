import React from 'react';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
} from 'react-native';

const FilterDrawer = ({
    allTypes,
    categoryFilter,
    onSelect,
    onClose,
}) => {
    return (
        <View style={styles.drawerOverlay}>
            <View style={styles.drawerContainer}>
                <Text style={styles.drawerTitle}>Filter Categories</Text>
                <FlatList
                    data={allTypes}
                    keyExtractor={(item) => item}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={[
                                styles.drawerItem,
                                item === categoryFilter && styles.drawerItemActive,
                            ]}
                            onPress={() => {
                                onSelect(item === categoryFilter ? null : item);
                                onClose();
                            }}
                        >
                            <Text style={styles.drawerItemText}>
                                {item.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                            </Text>
                        </TouchableOpacity>
                    )}
                />
                <TouchableOpacity
                    style={styles.drawerCloseButton}
                    onPress={onClose}
                >
                    <Text style={styles.drawerCloseText}>Close</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

export default FilterDrawer;

const styles = StyleSheet.create({
    drawerOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        top: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        justifyContent: 'flex-end',
    },
    drawerContainer: {
        backgroundColor: 'white',
        padding: 20,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '60%',
    },
    drawerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    drawerItem: {
        paddingVertical: 12,
    },
    drawerItemActive: {
        backgroundColor: '#e0f0ff',
        borderRadius: 10,
    },
    drawerItemText: {
        fontSize: 16,
    },
    drawerCloseButton: {
        marginTop: 20,
        alignSelf: 'center',
        padding: 10,
    },
    drawerCloseText: {
        color: '#2196F3',
        fontWeight: 'bold',
    },
});

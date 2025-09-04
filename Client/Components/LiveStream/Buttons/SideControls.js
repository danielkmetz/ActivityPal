import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

/**
 * Props:
 * - onFlip: () => void
 * - onToggleChat: () => void
 * - showChat: boolean
 * - isEnding: boolean (optional; if true, we hide via opacity)
 * - topPercent: number (default 60) — vertical placement as percent of screen height
 */
export default function SideControls({
    onFlip,
    onToggleChat,
    showChat,
    isEnding = false,
    topPercent = 60,
    host = false,
}) {
    return (
        <View
            style={[
                S.rail,
                { top: `${topPercent}%` },
                isEnding && { opacity: 0.001 },
            ]}
        >
            {host && (
                <TouchableOpacity
                    onPress={onFlip}
                    style={[S.chatToggle, { marginBottom: 15 }]}
                    accessibilityRole="button"
                    accessibilityLabel="Flip camera"
                >
                    <MaterialCommunityIcons name="camera-flip" size={26} color="#fff" />
                </TouchableOpacity>
            )}
            <TouchableOpacity
                onPress={onToggleChat}
                activeOpacity={0.8}
                style={S.chatToggle}
                accessibilityRole="button"
                accessibilityLabel={showChat ? 'Hide chat' : 'Show chat'}
            >
                <MaterialCommunityIcons
                    name={showChat ? 'chat' : 'chat-remove'}
                    size={26}
                    color="#fff"
                />
            </TouchableOpacity>
        </View>
    );
}

const S = StyleSheet.create({
    rail: {
        flexDirection: 'column',
        position: 'absolute',
        right: 10,
        zIndex: 3,
    },
    chatToggle: {
        transform: [{ translateY: -20 }],
        backgroundColor: 'rgba(0,0,0,0.55)',
        borderRadius: 22,
        padding: 8,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.25)',
    },
});

import React from 'react';
import { View, Text, Pressable, StyleSheet, TouchableOpacity } from 'react-native';
import StatusBadge from './StatusBadge'; // adjust path if you place this elsewhere

function formatTimeLocal(s) {
    const m = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${m}:${ss}`;
}

export default function LiveTopBar({
    isLiveish,
    elapsed = 0,                 // seconds
    status,                       // 'connecting' | 'reconnecting' | 'live' | 'error' | etc.
    viewerCount = 0,
    onClosePress,
    onBadgePress,
    live = null,
    isHost = false,
    style,                        // optional style override (e.g., to change top/left/right)
}) {
    const showEndButton = !!isLiveish;

    return (
        <View style={[S.topBar, style]}>
            <View style={S.topLeftRow}>
                {isHost ? (
                    <Pressable
                        onPress={onClosePress}
                        style={[S.pill, isLiveish && S.pillEnd]}
                        accessibilityRole="button"
                        accessibilityLabel={showEndButton ? 'End live stream' : 'Close'}
                    >
                        <Text style={S.pillTxt}>{showEndButton ? 'End' : 'Close'}</Text>
                    </Pressable>
                ) : (
                    <TouchableOpacity onPress={onClosePress}>
                        <Text style={S.back}>{'‹ Back'}</Text>
                    </TouchableOpacity>
                )}
                {isLiveish && isHost && (
                    <Text style={S.timer}>{formatTimeLocal(elapsed)}</Text>
                )}
            </View>
            {!isHost && (
                <View style={S.center} pointerEvents="none">
                    <Text style={S.title} numberOfLines={1}>
                        {live?.title || 'Live stream'}
                    </Text>
                </View>
            )}
            <StatusBadge
                status={status}
                isLiveish={isLiveish}
                viewerCount={viewerCount}
                onPress={onBadgePress}
            />
        </View>
    );
}

const S = StyleSheet.create({
    topBar: {
        position: 'absolute',
        top: 60,
        left: 16,
        right: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    topLeftRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    // NEW
    center: {
        position: 'absolute',
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    pill: {
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 18,
    },
    pillEnd: { backgroundColor: '#ef4444' },
    pillTxt: { color: '#fff', fontWeight: '700' },
    timer: { color: '#fff', fontWeight: '800' },
    back: { color: '#fff', fontSize: 16 },
    // FIX: typo + ensure horizontal centering
    title: { color: '#fff', fontSize: 16, fontWeight: '700', maxWidth: '70%', textAlign: 'center' },
});

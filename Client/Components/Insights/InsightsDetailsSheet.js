import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, TouchableWithoutFeedback } from 'react-native';
import ConversionFunnelCard from './BusinessHealth/ConversionFunnelCard';
import PeriodComparisonCard from './BusinessHealth/PeriodComparisonCard';
import useSlideDownDismiss from '../../utils/useSlideDown';
import Animated from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import Notch from '../Notch/Notch';

export default function InsightsDetailsSheet({
    visible, onClose, insights, loading, kpis, views, clicks, joins
}) {
    const [tab, setTab] = useState('funnel'); // 'funnel' | 'comparison'
    const { gesture, animateIn, animateOut, animatedStyle, } = useSlideDownDismiss(onClose);

    const tabs = useMemo(() => ([
        { key: 'funnel', label: 'Funnel' },
        { key: 'comparison', label: 'Comparison' },
    ]), []);

    useEffect(() => {
        if (visible) {
            animateIn();            // Animate it in
        } else {
            // Animate it out and hide the modal
            (async () => {
                await animateOut();
                onClose();
            })();
        }
    }, [visible]);

    return (
        <Modal visible={visible} transparent onRequestClose={animateOut}>
            <Pressable style={st.backdrop} onPress={animateOut} />
            <GestureDetector gesture={gesture}>
            <Animated.View style={[st.sheet, animatedStyle]}>
                <Notch/>
                <View style={st.headerRow}>
                    <Text style={st.title}>Insights Details</Text>
                </View>
                {/* Segmented toggle */}
                <View style={st.segment}>
                    {tabs.map(t => (
                        <Pressable
                            key={t.key}
                            style={[st.segBtn, tab === t.key && st.segBtnActive]}
                            onPress={() => setTab(t.key)}
                        >
                            <Text style={[st.segTxt, tab === t.key && st.segTxtActive]}>{t.label}</Text>
                        </Pressable>
                    ))}
                </View>
                {/* Content */}
                {tab === 'funnel' ? (
                    <ConversionFunnelCard views={views} clicks={clicks} joins={joins} loading={loading} />
                ) : (
                    <PeriodComparisonCard kpis={kpis} loading={loading} />
                )}
            </Animated.View>
            </GestureDetector>
        </Modal>
    );
}

const st = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
    sheet: {
        position: 'absolute', left: 0, right: 0, bottom: 0,
        backgroundColor: '#FFF', borderTopLeftRadius: 16, borderTopRightRadius: 16,
        padding: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#E5E7EB',
        paddingBottom: 50,
    },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    title: { fontSize: 16, fontWeight: '700', color: '#111827' },
    close: { fontSize: 12, fontWeight: '700', color: '#111827' },

    segment: {
        flexDirection: 'row', gap: 6, backgroundColor: '#F3F4F6',
        borderRadius: 10, padding: 4, marginBottom: 8,
    },
    segBtn: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 8 },
    segBtnActive: { backgroundColor: '#FFF', borderWidth: StyleSheet.hairlineWidth, borderColor: '#E5E7EB' },
    segTxt: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
    segTxtActive: { color: '#111827', fontWeight: '700' },
});

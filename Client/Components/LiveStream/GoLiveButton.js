import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';

export default function GoLiveButton() {
  const nav = useNavigation();
  return (
    <Pressable onPress={() => nav.navigate('PreLive')} style={S.btn} accessibilityLabel="Go live">
      <MaterialCommunityIcons name="broadcast" size={20} color="#fff" />
      <Text style={S.txt}>Go Live</Text>
    </Pressable>
  );
}
const S = StyleSheet.create({
  btn:{ position:'absolute', right:16, bottom:24, backgroundColor:'#111', paddingVertical:12, paddingHorizontal:16, borderRadius:26, flexDirection:'row', gap:8, elevation:4 },
  txt:{ color:'#fff', fontWeight:'700' }
});

import React from 'react';
import { Text, StyleSheet } from 'react-native';

export default function PostedDate({ post, style, prefix = 'Posted:' }) {
    const postContent = post?.original ? post?.original : post;
    const date = postContent?.date;

    let display = 'Now';
    if (date) {
        const d = new Date(date);
        if (!isNaN(d.getTime())) {
            display = d.toISOString().split('T')[0]; // YYYY-MM-DD
        }
    }

    return (
        <Text style={[styles.date, style]}>
            {prefix} {display}
        </Text>
    );
}

const styles = StyleSheet.create({
    date: {
        fontSize: 12,
        color: '#555',
        marginLeft: 10,
        marginTop: 10,
    },
});

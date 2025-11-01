import React from 'react';
import { Text, StyleSheet, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { logEngagementIfNeeded } from '../../../Slices/EngagementSlice';
import { useDispatch } from 'react-redux';

const smallPin = 'https://cdn-icons-png.flaticon.com/512/684/684908.png';

export default function TaggedUsersLine({
  post,
  onPressUser,
  includeAtWithBusiness = false,
  showAtWhenNoTags = false,
  prefix = ' is with ',
  containerStyle,
  nameStyle,
  connectorStyle,
  renderBusinessAccessory,   // <- only use if provided
}) {
  const dispatch = useDispatch();
  const postContent = post?.original ?? post ?? {};
  const navigation = useNavigation();
  const _nameStyle = [styles.name, nameStyle];
  const _connectorStyle = [styles.connector, connectorStyle];
  const {
    fullName: authorName,
    businessName,
    placeId,
    taggedUsers = [],
    userId: authorId,
  } = postContent;
  const postType = post?.type || post?.postType;
  const isCheckIn = postType === 'check-in';
  const isShared = postType === 'sharedPost' || postType === 'sharedPost' || !!post?.original;
  const safeTagged = Array.isArray(taggedUsers) ? taggedUsers : [];
  const hasTags = safeTagged.length > 0;

  const sharerName =
    postContent?.fullName ||
    (postContent?.user ? [postContent.user.firstName, postContent.user.lastName].filter(Boolean).join(' ') : undefined);
  const sharerId = postContent?.userId || postContent?.user?._id;

  const onPressBusiness = () => {
    logEngagementIfNeeded(dispatch, {
      targetType: 'place',
      targetId: placeId,
      placeId,
      engagementType: 'click',
    });
    navigation.navigate("BusinessProfile", { business: postContent });
  };

  const accessory =
    typeof renderBusinessAccessory === 'function'
      ? renderBusinessAccessory()
      : (isCheckIn ? (
        <Image source={{ uri: smallPin }} style={styles.pinIconSmall} />
      ) : null);

  if (isShared) {
    return (
      <Text style={[styles.line, containerStyle]}>
        {!!authorName && (
          <Text
            style={_nameStyle}
            onPress={() => onPressUser?.(authorId)}
            suppressHighlighting
          >
            {authorName}
          </Text>
        )}
        <Text style={_connectorStyle}>{' shared a post'}</Text>
      </Text>
    );
  }

  return (
    <Text style={[styles.line, containerStyle]}>
      {!!authorName && (
        <Text
          style={_nameStyle}
          onPress={() => onPressUser?.(authorId)}
          suppressHighlighting
        >
          {authorName}
        </Text>
      )}
      {hasTags ? (
        <>
          <Text style={_connectorStyle}>{prefix}</Text>
          {safeTagged.map((u, idx) => {
            const id = u?.userId ?? u?._id ?? `tag-${idx}`;
            const name = u?.fullName ?? u?.name ?? '';
            const targetId = u?.userId ?? u?._id;
            return (
              <Text
                key={id}
                style={_nameStyle}
                onPress={() => onPressUser?.(targetId)}
                suppressHighlighting
              >
                {name}
                {idx < safeTagged.length - 1 ? ', ' : ''}
              </Text>
            );
          })}
          {includeAtWithBusiness && !!businessName && (
            <>
              <Text style={_connectorStyle}>{' at '}</Text>
              <Text
                onPress={onPressBusiness}
                style={_nameStyle}
                suppressHighlighting
              >
                {businessName}
              </Text>
              {accessory}
            </>
          )}
        </>
      ) : (
        !!businessName &&
        showAtWhenNoTags && (
          <>
            <Text style={_connectorStyle}>{' is at '}</Text>
            <Text
              onPress={onPressBusiness}
              style={_nameStyle}
              suppressHighlighting
            >
              {businessName}
            </Text>
            {accessory}
          </>
        )
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  line: {
    flexShrink: 1,
    padding: 8
  },
  name: { fontSize: 18, fontWeight: 'bold' },
  connector: { fontSize: 16, fontWeight: 'bold', color: '#555' },
  pinIconSmall: { width: 14, height: 14, marginLeft: 6, marginBottom: -2 },
});

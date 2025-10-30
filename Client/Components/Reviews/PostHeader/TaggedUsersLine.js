import React from 'react';
import { Text, StyleSheet } from 'react-native';

export default function TaggedUsersLine({
  authorId,
  authorName,
  taggedUsers = [],
  businessName,
  onPressUser,
  onPressBusiness,
  includeAtWithBusiness = false,
  showAtWhenNoTags = false,
  prefix = ' is with ',
  containerStyle,
  nameStyle,
  connectorStyle,
  renderBusinessAccessory,   // <- only use if provided
}) {
  const safeTagged = Array.isArray(taggedUsers) ? taggedUsers : [];
  const hasTags = safeTagged.length > 0;
  const _nameStyle = [styles.name, nameStyle];
  const _connectorStyle = [styles.connector, connectorStyle];

  const accessory =
    typeof renderBusinessAccessory === 'function'
      ? renderBusinessAccessory()
      : null;

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
  line: {},
  name: { fontSize: 18, fontWeight: 'bold' },
  connector: { fontSize: 16, fontWeight: 'bold', color: '#555' },
});

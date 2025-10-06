import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const defaultColors = {
  like: '#1877F2',
  comment: '#1877F2',
  followRequest: '#42B72A',
  event: '#F28B24',
  default: '#808080',
};

const iconNames = {
  like: 'thumb-up-outline',
  comment: 'comment-outline',
  followRequest: 'account-plus-outline',
  event: 'calendar-star',
  default: 'bell-outline',
};

/**
 * Returns a pre-colored MaterialCommunityIcons icon for a notification type.
 * You can override `size` or `color` if needed: getNotificationIcon('like', { size: 20, color: '#fff' })
 */
export default function getNotificationIcon(type, { size = 24, color } = {}) {
  const name = iconNames[type] ?? iconNames.default;
  const tint = color ?? defaultColors[type] ?? defaultColors.default;
  return <MaterialCommunityIcons name={name} size={size} color={tint} />;
}

import { CommonActions } from '@react-navigation/native';
import { navigationRef } from './NavigationService';
import { handleFollowUserHelper } from './followHelper';

/** Build a nested navigate action for chains like:
 *  ['TabNavigator','Profile'] or ['TabNavigator','Home','OtherUserProfile']
 *  `finalParams` are attached to the last screen.
 */
function buildNestedNavigate(chain, finalParams = {}) {
  if (!Array.isArray(chain) || chain.length === 0) return null;

  // Start from the last screen and wrap up params
  let params = { screen: chain[chain.length - 1], params: finalParams };
  // Walk upward for deeper nesting
  for (let i = chain.length - 2; i >= 1; i--) {
    params = { screen: chain[i], params };
  }
  // Top-level container
  return CommonActions.navigate({ name: chain[0], params });
}

/**
 * Smart profile navigation:
 * - If target === current user -> do nothing (no navigation)
 * - Else:
 *    • If `otherUserPath` is provided, use it (e.g. ['TabNavigator','Home','OtherUserProfile'])
 *    • Otherwise just navigate to `otherUserRoute` in the current stack
 */
export function navigateToOtherUserProfile({
  navigation,
  userId,
  currentUserId,
  // For *other* users:
  otherUserRoute = 'OtherUserProfile',
  otherUserPath, // e.g. ['TabNavigator','Home','OtherUserProfile']
  extraParams = {},

  // Keeping these for compatibility though we won't use them for self-nav anymore
  selfRoute = 'Profile',
  selfPath = ['TabNavigator'],
}) {
  const same =
    userId != null &&
    currentUserId != null &&
    String(userId) === String(currentUserId);

  // Prefer using the global ref so this works from anywhere
  const nav = navigationRef?.current || navigation;

  // If it's the current user, do nothing
  if (same) {
    return;
  }

  // Different user
  if (Array.isArray(otherUserPath) && otherUserPath.length > 0) {
    const action = buildNestedNavigate(otherUserPath, { userId, ...extraParams });
    if (action && nav?.dispatch) {
      nav.dispatch(action);
      return;
    }
  }
  // Fallback: push in current stack (works if you're inside HomeStack)
  nav?.navigate?.(otherUserRoute, { userId, ...extraParams });
}

/** Thin wrapper so call sites don't import the lower-level helper everywhere. */
export function handleFollowUser({
  isPrivate,
  userId,
  mainUser,
  dispatch,
  setIsFollowing = () => {},
  setIsRequestSent = () => {},
  isFollowing,
  isRequestSent,
  mode = 'auto',
  sendNotification = true,
}) {
  return handleFollowUserHelper({
    isPrivate,
    userId,
    mainUser,
    dispatch,
    setIsFollowing,
    setIsRequestSent,
    isFollowing,
    isRequestSent,
    mode,
    sendNotification,
  });
}

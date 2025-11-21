import { gql } from '@apollo/client';

export const USER_CORE_FIELDS = gql`
  fragment UserCoreFields on User {
    id
    firstName
    lastName
    fullName
    profilePicUrl
    privacySettings {
      profileVisibility
      invites
      contentVisibility
      tagPermissions
      messagePermissions
    }
  }
`;

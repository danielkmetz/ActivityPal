import { gql } from '@apollo/client';

export const TAGGED_USER_FRAGMENT = gql`
  fragment TaggedUserFields on TaggedUser {
    userId
    fullName
    profilePicUrl
    x
    y
  }
`;
import { ApolloClient, InMemoryCache, createHttpLink, ApolloLink } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { getUserToken } from './functions';

// ✅ AuthLink: adds Bearer token
const authLink = setContext(async (_, { headers }) => {
  const token = await getUserToken();
  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : '',
    },
  };
});

// ✅ HttpLink: sets the target endpoint
const httpLink = createHttpLink({
  uri: process.env.EXPO_PUBLIC_SERVER_URL + '/graphql',
});

// ✅ Compose and export the client without logging
const client = new ApolloClient({
  link: ApolloLink.from([authLink, httpLink]),
  cache: new InMemoryCache(),
});

export default client;

import { ApolloClient, InMemoryCache, createHttpLink } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { getUserToken } from './functions';

const httpLink = createHttpLink({
  uri: process.env.EXPO_PUBLIC_SERVER_URL + '/graphql',
});

const authLink = setContext(async (_, { headers }) => {
  const token = await getUserToken();
  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : "",
    },
  };
});

const client = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache(),
});

export default client;

import io from 'socket.io-client';
import store from '../../store';
import { receiveMessage, receiveMessageEdited, receiveMessageDeleted } from '../../Slices/DirectMessagingSlice';
import { selectUser } from '../../Slices/UserSlice';
import { getUserToken } from '../../functions';
import { useSelector } from 'react-redux';

let socket;

export async function connectDmSocket(serverUrl) {
    if (socket?.connected) return socket;
    const user = useSelector(selectUser);
    const userId = user?.id;

    const token = await getUserToken();
    socket = io(`${serverUrl}/dm`, {
        transports: ['websocket'],
        auth: { token },
        reconnectionAttempts: 10,
        reconnectionDelay: 500,
    });

    socket.on('connect', () => {
        socket.emit('join', userId);
        console.log('📲 Joined personal DM room:', userId);
    });

    socket.on('newMessage', (msg) => {
        store.dispatch(receiveMessage(msg));
    });

    socket.on('messageEdited', ({ message }) => {
        store.dispatch(receiveMessageEdited(message));
    });

    socket.on('messageDeleted', ({ conversationId, messageId }) => {
        store.dispatch(receiveMessageDeleted({ conversationId, messageId }));
    });

    return socket;
}

export function getDmSocket() {
    return socket;
}

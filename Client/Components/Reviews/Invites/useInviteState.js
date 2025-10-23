import { useEffect, useMemo, useState } from 'react';
import { getTimeLeft } from '../../../functions';

const toId = (v) => (v && v.toString ? v.toString() : v || '');
const pickId = (obj) => toId(obj?.userId ?? obj?.user?.id ?? obj?.user?._id ?? obj?._id ?? obj?.id);

export function useInviteState(invite, currentUserId) {
  const [timeLeft, setTimeLeft] = useState(getTimeLeft(invite?.dateTime));

  useEffect(() => {
    const id = setInterval(() => setTimeLeft(getTimeLeft(invite?.dateTime)), 1000);
    return () => clearInterval(id);
  }, [invite?.dateTime]);

  const { isSender, isRecipient, isGoing } = useMemo(() => {
    const me = toId(currentUserId);

    // sender can be senderId or sender.id/_id
    const senderId = toId(invite?.senderId ?? invite?.sender?.id ?? invite?.sender?._id);
    const isSenderFlag = !!me && !!senderId && me === senderId;

    const recips = Array.isArray(invite?.recipients) ? invite.recipients : [];

    const isRecipientFlag = recips.some(r => pickId(r) === me);

    const isGoingFlag = recips.some(
      r => pickId(r) === me && r.status === 'accepted'
    );

    return { isSender: isSenderFlag, isRecipient: isRecipientFlag, isGoing: isGoingFlag };
  }, [invite?.senderId, invite?.sender, invite?.recipients, currentUserId]);

  return { timeLeft, isSender, isRecipient, isGoing };
}

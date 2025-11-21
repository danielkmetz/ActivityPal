import { useEffect, useMemo, useState } from 'react';
import { getTimeLeft } from '../../../functions';

const toId = (v) => (v && v.toString ? v.toString() : v || '');
const pickId = (obj) => toId(obj?.userId ?? obj?.user?.id ?? obj?.user?._id ?? obj?._id ?? obj?.id);

export function useInviteState(invite, currentUserId) {
  const dateTime = invite?.dateTime || invite?.details?.dateTime;
  const owner = invite?.owner || invite?.sender;
  const details = invite?.details;
  const [timeLeft, setTimeLeft] = useState(getTimeLeft(dateTime));

  useEffect(() => {
    const id = setInterval(() => setTimeLeft(getTimeLeft(dateTime)), 1000);
    return () => clearInterval(id);
  }, [dateTime]);

  const { isSender, isRecipient, isGoing } = useMemo(() => {
    const me = toId(currentUserId);

    // sender can be senderId or sender.id/_id
    const senderId = toId(owner?.senderId ?? owner?.id ?? owner?._id);
    const isSenderFlag = !!me && !!senderId && me === senderId;

    const recips = Array.isArray(details?.recipients) ? details.recipients : [];

    const isRecipientFlag = recips.some(r => pickId(r) === me);

    const isGoingFlag = recips.some(
      r => pickId(r) === me && r.status === 'accepted'
    );

    return { isSender: isSenderFlag, isRecipient: isRecipientFlag, isGoing: isGoingFlag };
  }, [invite?.senderId, invite?.sender, invite?.recipients, currentUserId]);

  return { timeLeft, isSender, isRecipient, isGoing };
}

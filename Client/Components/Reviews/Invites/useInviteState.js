import { useEffect, useState } from 'react';
import { getTimeLeft } from '../../../functions';

export function useInviteState(invite, currentUserId) {
  const [timeLeft, setTimeLeft] = useState(getTimeLeft(invite?.dateTime));
  useEffect(() => {
    const id = setInterval(() => setTimeLeft(getTimeLeft(invite?.dateTime)), 1000);
    return () => clearInterval(id);
  }, [invite?.dateTime]);

  const isSender = invite?.sender?.id === currentUserId;
  const isRecipient = currentUserId !== invite?.sender?.id &&
    !invite?.recipients?.some(r => r.userId?.toString() === currentUserId?.toString());

  return { timeLeft, isSender, isRecipient };
}

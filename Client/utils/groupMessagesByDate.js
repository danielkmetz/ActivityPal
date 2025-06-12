import { format, isToday, isYesterday } from 'date-fns';

export const groupMessagesByDate = (messages) => {
  const result = [];
  let lastDate = null;

  messages.forEach((msg) => {
    const msgDate = new Date(msg.sentAt);
    const dateKey = msgDate.toDateString();

    if (dateKey !== lastDate) {
      lastDate = dateKey;

      let label = format(msgDate, 'MMMM d, yyyy');
      if (isToday(msgDate)) label = 'Today';
      else if (isYesterday(msgDate)) label = 'Yesterday';

      result.push({ type: 'date', id: `date-${dateKey}`, label });
    }

    result.push({ ...msg, type: 'message' });
  });

  return result;
};

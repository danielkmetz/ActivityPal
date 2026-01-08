import { useCallback, useState } from "react";
import { useDispatch } from "react-redux";
import { submitInvite as submitInviteService, extractErrMessage } from "../utils/Invites/submitInvite";

export default function useSubmitInvite() {
  const dispatch = useDispatch();
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(
    async (draft) => {
      if (submitting) return { cancelled: true, skipped: true };

      setSubmitting(true);
      try {
        const {
          mode,          // "create" | "edit"
          inviteId,       // required for edit
          actions,        // { sendInviteWithConflicts, editInviteWithConflicts }
          ...payload      // userId, venue, dateTime, message, isPublic, media, recipientIds
        } = draft || {};

        return await submitInviteService({
          dispatch,
          mode,
          inviteId,
          actions,
          payload,
        });
      } catch (err) {
        const msg = extractErrMessage(err) || "Something went wrong. Please try again.";
        const e = new Error(msg);
        e.original = err;
        throw e;
      } finally {
        setSubmitting(false);
      }
    },
    [dispatch, submitting]
  );

  return { submit, submitting };
}

import { useCallback, useState } from "react";
import { useDispatch } from "react-redux";
import { submitPost, extractErrMessage } from "../utils/posts/submitPost";

export default function useSubmitPost() {
  const dispatch = useDispatch();
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(
    async (args) => {
      setSubmitting(true);
      try {
        const res = await submitPost({ dispatch, ...args });
        return res;
      } catch (err) {
        // normalize to a clean Error message for UI
        const msg = extractErrMessage(err) || "Failed to submit.";
        throw new Error(msg);
      } finally {
        setSubmitting(false);
      }
    },
    [dispatch]
  );

  return { submit, submitting };
}

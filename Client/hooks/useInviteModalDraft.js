import { useEffect, useMemo, useRef, useState } from "react";
import useInviteDraft from "./useInviteDraft";
import { getSuggestionContent, deriveSuggestedMeta, buildScheduleDescriptionFromSuggestion, computeSuggestedDateTime } from "../utils/Invites/suggestionSchedule";

export default function useInviteModalDraft({
    visible,
    isEditing,
    initialInvite,
    suggestion,
    friends,
}) {
    const { suggestionContent, fromSharedPost } = useMemo(
        () => getSuggestionContent(suggestion),
        [suggestion]
    );

    const [selectedVenue, setSelectedVenue] = useState(null);

    // A counter that increments every time the modal opens,
    // so edits don’t “stick” when you reopen without saving.
    const openCountRef = useRef(0);
    const [resetKey, setResetKey] = useState(0);

    useEffect(() => {
        if (!visible) return;
        openCountRef.current += 1;
        setResetKey(openCountRef.current);
    }, [visible]);

    const draft = useInviteDraft({
        isEditing,
        initialInvite,
        selectedVenue, // this is the live selection for deriveVenue()
        friends,
        resetKey, // requires small change in useInviteDraft (shown below)
    });

    const suggestedMeta = useMemo(() => {
        return suggestionContent ? deriveSuggestedMeta(suggestionContent) : null;
    }, [suggestionContent]);

    const lockPlace = useMemo(() => {
        if (isEditing) return false;
        return !!suggestionContent?.placeId && !!suggestionContent?.businessName;
    }, [isEditing, suggestionContent?.placeId, suggestionContent?.businessName]);

    const lockedPlaceSubtitle = useMemo(() => {
        if (!suggestionContent) return null;
        const schedule = buildScheduleDescriptionFromSuggestion(suggestionContent);
        return schedule ? `Available ${schedule}` : null;
    }, [suggestionContent]);

    // On open: prefill from suggestion (create mode), or clear selection (edit mode)
    useEffect(() => {
        if (!visible) return;

        if (isEditing) {
            setSelectedVenue(null); // let deriveVenue use initialInvite
            return;
        }

        if (suggestedMeta?.suggestedVenue) {
            setSelectedVenue(suggestedMeta.suggestedVenue);

            if (suggestedMeta.suggestedMessage) {
                // only fill message if user hasn’t typed yet
                if (!draft.message) draft.setMessage(suggestedMeta.suggestedMessage);
            }

            const dt = computeSuggestedDateTime({
                baseStart: suggestedMeta.baseStart,
                recurring: suggestedMeta.recurring,
                recurringDays: suggestedMeta.recurringDays,
                fromSharedPost,
            });

            draft.setDateTime(dt);
            return;
        }

        // Plain create: hard reset to defaults
        setSelectedVenue(null);
        draft.setMessage("");
        draft.setDateTime(new Date());
        draft.setSelectedFriends([]);
        draft.setIsPublic(true);
    }, [visible, isEditing, suggestedMeta, fromSharedPost]); // intentionally not depending on draft state setters

    return {
        suggestionContent,
        fromSharedPost,

        selectedVenue,
        setSelectedVenue,

        lockPlace,
        lockedPlaceSubtitle,

        ...draft,
    };
}

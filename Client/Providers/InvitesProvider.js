import React, { useEffect, useMemo, createContext, useContext } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchUserInvites,
  clearInvites,
  selectInviteIds,
  selectInvitesStatus,
  selectInvitesError,
  selectRecapCandidateInvites,
} from '../Slices/InvitesSlice';
import { selectUser } from '../Slices/UserSlice';

// -------------------- Context shape --------------------

const InvitesContext = createContext({
  invitesLoaded: false,
  loading: false,
  error: null,
  inviteIds: [],
  recapCandidates: [],
  recapCount: 0,
});

// Hook so components can consume easily
export const useInvites = () => useContext(InvitesContext);

// -------------------- Provider --------------------

export const InvitesProvider = ({ children }) => {
  const dispatch = useDispatch();
  const user = useSelector(selectUser); // whatever your user slice returns
  const status = useSelector(selectInvitesStatus);
  const error = useSelector(selectInvitesError);
  const inviteIds = useSelector(selectInviteIds);
  const recapCandidates = useSelector(selectRecapCandidateInvites);
  const userId = user?.id || user?._id || null;

  // Refetch invites whenever the logged-in user changes
  useEffect(() => {
    if (!userId) {
      // user logged out / not ready yet
      dispatch(clearInvites());
      return;
    }

    // fresh load for this user
    dispatch(clearInvites());
    dispatch(fetchUserInvites({ limit: 100 }));
  }, [userId, dispatch]);

  const value = useMemo(
    () => ({
      invitesLoaded: status === 'succeeded',
      loading: status === 'loading',
      error,
      inviteIds,
      recapCandidates,
      recapCount: recapCandidates.length,
    }),
    [status, error, inviteIds, recapCandidates]
  );

  return (
    <InvitesContext.Provider value={value}>
      {children}
    </InvitesContext.Provider>
  );
};

export default InvitesProvider;

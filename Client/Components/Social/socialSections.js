import { TABS } from "./socialConstants";

export function buildRequestsSections({ followRequests, inviteRequests = [] }) {
  const received = followRequests?.received || [];
  return [
    { title: "Follow Requests", kind: "follow", data: received },
    { title: "Invite Requests", kind: "invite", data: inviteRequests }, // wire later
  ];
}

export function buildPlansSections({ invites = [] }) {
  // later: split invites into needsReply/going/hosting
  return [
    { title: "Needs Reply", kind: "needsReply", data: [] },
    { title: "Going", kind: "going", data: [] },
    { title: "Hosting", kind: "hosting", data: [] },
  ];
}

export function getDefaultTab() {
  return TABS.PEOPLE;
}

import React from "react";
import MessageThreadTitle from "./MessageThreadTitle"; // adjust path to match your project

export function getHeaderTitle(currentRoute, { userToMessage } = {}) {
  switch (currentRoute) {
    case "Activities":
      return "Activities";
    case "Home":
      return "Vybe";
    case "Friends":
      return "Friends";
    case "Social":
      return "Social";
    case "Notifications":
      return "Notifications";
    case "Reviews":
      return "Reviews";
    case "Insights":
      return "Insights";
    case "CreatePost":
      return "Post";
    case "DirectMessages":
      return "Messages";
    case "SearchFollowing":
      return "New Message";
    case "FilterSort":
      return "Filter/Sort";
    case "Settings":
      return "Settings";
    case "HiddenPosts":
      return "Hidden Posts";
    case "MyPlans":
      return "My Plans";
    case "InviteDetails":
      return "Details";
    case "FriendDiscovery":
      return "Discover";
    case "MessageThread":
      return <MessageThreadTitle users={userToMessage || []} />;
    default:
      return "Vybe";
  }
}

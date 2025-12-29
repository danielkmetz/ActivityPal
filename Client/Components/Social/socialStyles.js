import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  // Segmented tabs
  tabsWrap: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: "#e6e6ef",
  },
  tabPill: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  tabPillActive: { backgroundColor: "#2f5cff" },
  tabPillInactive: { backgroundColor: "transparent" },
  tabText: { fontSize: 14, fontWeight: "800" },
  tabTextActive: { color: "#fff" },
  tabTextInactive: { color: "#333" },

  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#ff3b30",
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 12, fontWeight: "800" },

  // Find friends card
  findFriendsCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#eaf2ff",
    borderWidth: 1,
    borderColor: "#d6e6ff",
    marginBottom: 12,
  },
  findFriendsTitle: { fontSize: 16, fontWeight: "800", color: "#123" },
  findFriendsSub: { marginTop: 2, fontSize: 13, color: "#567" },
  findFriendsButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#2f5cff",
  },
  findFriendsButtonText: { color: "#fff", fontWeight: "800" },

  // Rows
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#eee",
    marginBottom: 10,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#d9dbe6",
    marginRight: 12,
  },
  rowTitle: { fontSize: 15, fontWeight: "800", color: "#111" },
  rowSub: { marginTop: 2, fontSize: 13, color: "#666" },
  chevron: { fontSize: 22, color: "#999", marginLeft: 8 },
});

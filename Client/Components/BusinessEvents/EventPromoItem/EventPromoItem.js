import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import EventDetailsCard from "../EventDetailsCard";
import PhotoFeed from "../../Reviews/Photos/PhotoFeed";
import PostActions from "../../Reviews/PostActions/PostActions";

export default function EventPromoItem({
  item,
  selectedTab,            
  isDropdownOpen,
  onToggleDropdown,       
  onEdit,                 
  onDelete,               
  scrollX,
  photoTapped,
  setPhotoTapped,
  onActiveChange = () => {},
  styleOverrides = null,
}) {
  const [hasMedia, setHasMedia] = useState(true);      // PhotoFeed will correct it
  const [activeMediaItem, setActiveMediaItem] = useState(null);

  return (
    <View style={styles.itemCard}>
      {/* Three-dot menu */}
      <View style={styles.menuContainer}>
        <TouchableOpacity onPress={() => onToggleDropdown(item._id)}>
          <Text style={styles.menuDots}>⋮</Text>
        </TouchableOpacity>
        {isDropdownOpen && (
          <View style={styles.dropdownMenu}>
            <TouchableOpacity
              style={[styles.dropdownItem, styles.editButton]}
              onPress={() => onEdit(item)}
            >
              <Text style={styles.dropdownText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dropdownItem, styles.deleteButton]}
              onPress={() => onDelete(item)}
            >
              <Text style={styles.dropdownText}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      <View style={styles.itemInfo}>
        <EventDetailsCard item={item} selectedTab={selectedTab} styles={styleOverrides} />
        <PhotoFeed
          post={item}
          scrollX={scrollX}
          photoTapped={photoTapped}
          setPhotoTapped={setPhotoTapped}
          onActiveChange={onActiveChange}
          isMyEventsPromosPage={true}
          onHasMediaChange={setHasMedia}
          onActiveMediaChange={setActiveMediaItem}
        />
        <View style={{ paddingLeft: 15 }}>
          <PostActions
            post={item}
            onShare={() => {}}
            photo={activeMediaItem} // optional: only if PostActions uses it
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  itemCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 5,
    marginBottom: 10,
    elevation: 2,
    position: "relative",
    paddingBottom: 20,
  },
  itemInfo: { flex: 1 },
  menuContainer: {
    position: "absolute",
    top: 20,
    right: 10,
    zIndex: 10,
  },
  menuDots: { fontSize: 30, color: "#555", paddingHorizontal: 10 },
  dropdownMenu: {
    position: "absolute",
    top: 30,
    right: 0,
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 10,
    elevation: 20,
    minWidth: 120,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    zIndex: 9999,
  },
  dropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 5,
    marginBottom: 5,
    alignItems: "center",
  },
  editButton: { backgroundColor: "gray" },
  deleteButton: { backgroundColor: "#ff5050" },
  dropdownText: { fontSize: 16, color: "white", fontWeight: "bold" },
});

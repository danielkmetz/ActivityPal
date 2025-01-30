import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
} from "react-native";
import { Ionicons, FontAwesome } from "@expo/vector-icons";
import SettingsModal from "./SettingsModal";
import { useSelector } from "react-redux";
import { selectUser } from "../../Slices/UserSlice";
import bannerPlaceholder from '../../assets/pics/business-placeholder.png';
import logoPlaceholder from '../../assets/pics/logo-placeholder.png';
import EditProfileModal from "./EditProfileModal";
import { selectLogo, fetchLogo, selectBanner, fetchBanner, selectAlbum, fetchPhotos } from "../../Slices/PhotosSlice";
import { useDispatch } from "react-redux";

export default function BusinessProfile() {
  const dispatch = useDispatch();
  const [modalVisible, setModalVisible] = useState(false);
  const [activeSection, setActiveSection] = useState("about"); // Manage active section
  const [editModalVisible, setEditModalVisible] = useState(false);
  const user = useSelector(selectUser).businessDetails;
  const logo = useSelector(selectLogo);
  const banner = useSelector(selectBanner);
  const photos = useSelector(selectAlbum);
  const businessName = user?.businessName;
  const placeId = user?.placeId;
  const likes = 120; // Placeholder for likes
  const avgRating = 4.2; // Placeholder for average rating
  const location = user?.location;
  const phone = user?.phone || "Enter a phone number";
  const description = user?.description || "Enter a description of your business";

  useEffect(() => {
    if (placeId) {
      dispatch(fetchLogo(placeId));
      dispatch(fetchBanner(placeId));
      dispatch(fetchPhotos(placeId));
    }
  }, [placeId]);

  // Helper function to render stars based on the rating
  const renderStars = (rating) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      if (i <= Math.floor(rating)) {
        // Full star
        stars.push(<Ionicons key={i} name="star" size={20} color="gold" />);
      } else if (i - rating < 1 && rating % 1 !== 0) {
        // Half star
        stars.push(<Ionicons key={i} name="star-half" size={20} color="gold" />);
      } else {
        // Empty star
        stars.push(<Ionicons key={i} name="star-outline" size={20} color="gray" />);
      }
    }
    return stars;
  };

  return (
    <>
      <ScrollView style={styles.container}>
        {/* Banner Background */}
        <Image source={banner ? {uri: banner} : bannerPlaceholder} style={styles.banner} />

        {/* Profile Section */}
        <View style={styles.profileContainer}>

          {/* Profile Picture */} 
          <Image 
            source={logo ? {uri: logo} : logoPlaceholder} 
            style={styles.profilePicture}
            resizeMode="contain" 
          />
        
          {/* Business Name and Settings */}
          <View style={styles.nameSettings}>
            <Text style={styles.businessName}>{businessName}</Text>
            <TouchableOpacity
              style={styles.settingsIcon}
              onPress={() => setModalVisible(true)}
            >
              <Ionicons name="settings-sharp" size={24} color="gray" />
            </TouchableOpacity>
          </View>

          {/* Indicators */}
          <View style={styles.indicatorsContainer}>
            <View style={styles.indicator}>
              <Text style={styles.indicatorLabel}>
                Likes{" "}
                <FontAwesome name="thumbs-up" size={14} color="gray" />
              </Text>
              <Text style={styles.indicatorValue}>{likes}</Text>
            </View>
            <View style={styles.indicator}>
              <Text style={styles.indicatorLabel}>Avg Rating</Text>
              <View style={styles.starsContainer}>{renderStars(avgRating)}</View>
            </View>
            {/* Edit Profile Button */}
            <TouchableOpacity
              style={styles.editProfileButton}
              onPress={() => setEditModalVisible(true)}
            >
              <Ionicons name="pencil" size={20} color="white" />
              <Text style={styles.editProfileButtonText}>Edit Profile</Text>
            </TouchableOpacity>
          </View>

          {/* Navigation Buttons */}
          <View style={styles.divider} />
          <View style={styles.navButtonsContainer}>
            <TouchableOpacity
              style={[
                styles.navButton,
                activeSection === "about" && styles.activeButton,
              ]}
              onPress={() => setActiveSection("about")}
            >
              <Text style={styles.navButtonText}>About</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.navButton,
                activeSection === "photos" && styles.activeButton,
              ]}
              onPress={() => setActiveSection("photos")}
            >
              <Text style={styles.navButtonText}>Photos</Text>
            </TouchableOpacity>
          </View>

          {/* Render About Section */}
          {activeSection === "about" && (
            <View style={styles.aboutContainer}>
              <Text style={styles.aboutLabel}>Address:</Text>
              <Text>{location}</Text>
              <Text style={styles.aboutLabel}>Phone:</Text>
              <Text>{phone}</Text>
              <Text style={styles.aboutLabel}>Description:</Text>
              <Text>{description}</Text>
            </View>
          )}

          {/* Render Photos Section */}
          {activeSection === "photos" && (
            <FlatList
              data={photos}
              keyExtractor={(item) => item.photoKey}
              numColumns={3}
              renderItem={({ item }) => (
                <Image source={{ uri: item.url }} style={styles.photo} />
              )}
              contentContainerStyle={styles.photosGrid}
            />
          )}
        </View>
      </ScrollView>

      <SettingsModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
      />
      <EditProfileModal
        visible={editModalVisible}
        setEditModalVisible={setEditModalVisible}
        onClose={() => setEditModalVisible(false)}
        bannerPlaceholder={bannerPlaceholder}
        aboutInfo={{
          address: location,
          phone,
          description,
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  banner: {
    height: 200,
    backgroundColor: "#0073e6", // Banner background color
    position: "relative", // To position the settings icon inside the banner
    width: '100%',
  },
  profileContainer: {
    marginTop: -75, // Pull the profile picture up to overlap the banner
    alignItems: "flex-start", // Align profile picture and text to the left
  },
  profilePicture: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 5, // Optional border for better overlap effect
    borderColor: "#fff", // White border to match the background
    backgroundColor: 'white'
  },
  nameSettings: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  businessName: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333", // Dark text color
    textAlign: "left",
    maxWidth: "60%",
    marginLeft: 15,
  },
  settingsIcon: {
    padding: 5,
    marginRight: 20,
  },
  indicatorsContainer: {
    flexDirection: "row",
    marginTop: 10,
    justifyContent: "space-between",
    width: "80%", // Adjust width for spacing
    marginLeft: 15,
  },
  indicator: {
    flexDirection: "column",
    alignItems: "center",
  },
  indicatorLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    flexDirection: "row",
    alignItems: "center",
  },
  indicatorValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#0073e6",
  },
  starsContainer: {
    flexDirection: "row",
    marginTop: 5,
  },
  divider: {
    width: "100%",
    height: 1,
    backgroundColor: "lightgray", // Line color
    marginVertical: 5, // Spacing above and below the line
  },
  navButtonsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginVertical: 10,
    marginLeft: 15,
  },
  navButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 30,
  },
  activeButton: {
    backgroundColor: 'rgba(144, 238, 144, 0.4)',
  },
  navButtonText: {
    color: "black",
    fontWeight: "bold",
  },
  aboutContainer: {
    padding: 10,
    width: '100%'
  },
  aboutLabel: {
    fontWeight: "bold",
    marginTop: 10,
  },
  photosGrid: {
    padding: 10,
  },
  photo: {
    width: 100,
    height: 100,
    margin: 5,
    borderRadius: 5,
  },
  defaultLogo: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "#008080", // Teal background
    justifyContent: "center", // Center the text
    alignItems: "center", // Center the text
    borderWidth: 5, // Optional border
    borderColor: "#fff", // White border to match design
  },
  defaultLogoText: {
    color: "#fff", // White text for contrast
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "center",
  },
  editProfileButton: {
    backgroundColor: "gray",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    marginLeft: 10,
  },
  editProfileButtonText: {
    color: "white",
    marginLeft: 5,
    fontWeight: "bold",
  },
  
});

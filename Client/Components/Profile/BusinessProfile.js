import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  FlatList,
} from "react-native";
import { Ionicons, FontAwesome } from "@expo/vector-icons";
import SettingsModal from "./SettingsModal";
import { useSelector, useDispatch } from "react-redux";
import { selectUser } from "../../Slices/UserSlice";
import bannerPlaceholder from '../../assets/pics/business-placeholder.png';
import logoPlaceholder from '../../assets/pics/logo-placeholder.png';
import EditProfileModal from "./EditProfileModal";
import { selectLogo, fetchLogo, selectBanner, fetchBusinessBanner, selectAlbum, fetchPhotos } from "../../Slices/PhotosSlice";
import { useRoute, useNavigation } from "@react-navigation/native";
import { fetchReviewsByPlaceId, selectBusinessReviews, appendBusinessReviews, setBusinessReviews } from '../../Slices/ReviewsSlice';
import Reviews from "../Reviews/Reviews";
import Photos from "./Photos";
import { selectFavorites, addFavorite, removeFavorite } from "../../Slices/FavoritesSlice";
import usePaginatedFetch from "../../utils/usePaginatedFetch";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import ModalBox from 'react-native-modal';

export default function BusinessProfile() {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const route = useRoute();
  const business = route?.params?.business;

  const conditionalSection = business ? "reviews" : "about";
  const [activeSection, setActiveSection] = useState(conditionalSection);
  const [modalVisible, setModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const user = business ? business : useSelector(selectUser).businessDetails;
  const mainUser = useSelector(selectUser);
  const mainUserFavorites = useSelector(selectFavorites);
  const reviews = useSelector(selectBusinessReviews);
  const logo = useSelector(selectLogo);
  const banner = useSelector(selectBanner);
  const photos = useSelector(selectAlbum);
  const businessName = user?.businessName;
  const placeId = user?.placeId;
  const likes = 120;
  const avgRating = 4.2;
  const location = user?.location;
  const phone = user?.phone || "Enter a phone number";
  const description = user?.description || "Enter a description of your business";
  const [isFavorited, setIsFavorited] = useState(mainUserFavorites?.includes(placeId));
  const [favoriteModalVisible, setFavoriteModalVisible] = useState(false);

  const {
    loadMore,
    refresh,
    isLoading,
    hasMore,
  } = usePaginatedFetch({
    fetchThunk: fetchReviewsByPlaceId,
    appendAction: appendBusinessReviews,
    resetAction: setBusinessReviews,
    params: { placeId },
    limit: 10,
  });

  const handleFavoritePress = () => {
    if (isFavorited) {
      setFavoriteModalVisible(true); // Show the modal for removal confirmation
    } else {
      dispatch(addFavorite({ userId: mainUser.id, placeId }));
      setIsFavorited(true); // ✅ Update local state immediately
    }
  };

  const handleRemoveFavorite = () => {
    dispatch(removeFavorite({ userId: mainUser.id, placeId }));
    setIsFavorited(false); // ✅ Update local state immediately
    setFavoriteModalVisible(false);
  };

  useEffect(() => {
    if (placeId && typeof placeId === 'string' && placeId.trim() !== '') {
      dispatch(fetchLogo(placeId));
      dispatch(fetchBusinessBanner(placeId));
      dispatch(fetchPhotos(placeId));
      refresh();
    }
  }, [placeId]);

  const renderStars = (rating) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      if (i <= Math.floor(rating)) {
        stars.push(<Ionicons key={i} name="star" size={20} color="gold" />);
      } else if (i - rating < 1 && rating % 1 !== 0) {
        stars.push(<Ionicons key={i} name="star-half" size={20} color="gold" />);
      } else {
        stars.push(<Ionicons key={i} name="star-outline" size={20} color="gray" />);
      }
    }
    return stars;
  };

  const renderHeader = () => (
    <>
      {business && (
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="gray" />
        </TouchableOpacity>
      )}
      <Image source={banner?.url ? { uri: banner?.url } : bannerPlaceholder} style={styles.banner} />
      <View style={styles.profileContainer}>
        <Image source={logo ? { uri: logo } : logoPlaceholder} style={styles.profilePicture} resizeMode="contain" />
        <View style={styles.nameSettings}>
          <Text style={styles.businessName}>{businessName}</Text>
          {!business &&
            <TouchableOpacity style={styles.settingsIcon} onPress={() => setModalVisible(true)}>
              <Ionicons name="settings-sharp" size={24} color="gray" />
            </TouchableOpacity>
          }
        </View>
        <View style={business ? styles.indicatorContainerRestricted : styles.indicatorsContainer}>
          <View style={styles.indicator}>
            <Text style={styles.indicatorLabel}>
              Likes <FontAwesome name="thumbs-up" size={14} color="gray" />
            </Text>
            <Text style={styles.indicatorValue}>{likes}</Text>
          </View>
          <View style={styles.indicator}>
            <Text style={styles.indicatorLabel}>Avg Rating</Text>
            <View style={business ? [styles.starsContainer, { marginLeft: 15 }] : styles.starsContainer}>
              {renderStars(avgRating)}
            </View>
          </View>
          {!business ? (
            <TouchableOpacity style={styles.editProfileButton} onPress={() => setEditModalVisible(true)}>
              <Ionicons name="pencil" size={20} color="white" />
              <Text style={styles.editProfileButtonText}>Edit Profile</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.favoriteButton, isFavorited && styles.isFavorited]}
              onPress={handleFavoritePress}
            >
              <Ionicons name="star" size={20} color="white" />
              <Text style={styles.editProfileButtonText}>{isFavorited ? "Favorited" : "Favorite"}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <View style={styles.divider} />
      <View style={styles.navButtonsContainer}>
        {business && (
          <TouchableOpacity
            style={[styles.navButton, activeSection === "reviews" && styles.activeButton]}
            onPress={() => setActiveSection("reviews")}
          >
            <Text style={styles.navButtonText}>Reviews</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.navButton, activeSection === "about" && styles.activeButton]}
          onPress={() => setActiveSection("about")}
        >
          <Text style={styles.navButtonText}>About</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navButton, activeSection === "photos" && styles.activeButton]}
          onPress={() => setActiveSection("photos")}
        >
          <Text style={styles.navButtonText}>Photos</Text>
        </TouchableOpacity>
      </View>
      {activeSection === "reviews" && business && (
        <Reviews reviews={reviews} onLoadMore={loadMore} isLoadingMore={isLoading} hasMore={hasMore} />
      )}
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
      {activeSection === "photos" && <Photos photos={photos} />}

    </>
  );

  return (
    <>
      <FlatList
        style={styles.container}
        data={null}
        keyExtractor={(item) => item.photoKey}
        numColumns={3}
        ListHeaderComponent={renderHeader()}
        renderItem={null}
        contentContainerStyle={styles.photosGrid}
        showsVerticalScrollIndicator={false}
      />
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
      {/* React Native Modal */}
      <ModalBox
        isVisible={favoriteModalVisible}
        onBackdropPress={() => setFavoriteModalVisible(false)}
        style={styles.bottomModal} // ✅ Match styling
      >
        <View style={styles.modalContent}>
          {/* Modal Title */}
          <Text style={styles.modalTitle}>Remove from Favorites?</Text>

          {/* Remove Button */}
          <TouchableOpacity onPress={handleRemoveFavorite} style={styles.modalButton}>
            <MaterialCommunityIcons name="delete-outline" size={20} color="red" />
            <Text style={styles.modalButtonTextRed}>Remove</Text>
          </TouchableOpacity>

          {/* Cancel Button */}
          <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.modalCancelButton}>
            <Text style={styles.modalCancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </ModalBox>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  backButton: {
    position: "absolute",
    top: 40,
    left: 20,
    zIndex: 10,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    borderRadius: 20,
    padding: 8,
    marginTop: 20,
  },
  banner: {
    height: 200,
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
  indicatorContainerRestricted: {
    flexDirection: 'row',
    marginTop: 10,
    width: '80%',
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
    marginVertical: 10,
    marginLeft: 5,
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
    padding: 0,
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
  favoriteButton: {
    backgroundColor: "teal",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    marginLeft: 10,
  },
  isFavorited: {
    backgroundColor: 'gray',
  },
  bottomModal: {
    justifyContent: "flex-end",
    margin: 0,
  },
  modalContent: {
    backgroundColor: "#fff",
    padding: 20,
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#333",
  },
  modalButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    width: "100%",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    justifyContent: "center",
  },
  modalButtonText: {
    fontSize: 16,
    marginLeft: 10,
    color: "#333",
  },
  modalButtonTextRed: {
    fontSize: 16,
    marginLeft: 10,
    color: "red",
  },
  modalCancelButton: {
    padding: 15,
    width: "100%",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  modalCancelButtonText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#007bff",
  },
});

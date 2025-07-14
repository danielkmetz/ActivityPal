import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import logoPlaceholder from '../../assets/pics/logo-placeholder.png';
import RatingsData from '../Reviews/metricRatings/RatingsData';

export default function BusinessProfileHeader({
  logo,
  businessName,
  business,
  ratingData,
  isFavorited,
  navgateToSettings,
  setEditModalVisible,
  handleFavoritePress,
  handleSendMessage,
}) {
  return (
    <View style={styles.profileContainer}>
      <Image
        source={logo ? { uri: logo } : logoPlaceholder}
        style={styles.profilePicture}
        resizeMode="contain"
      />
      <View style={styles.nameSettings}>
        <Text style={styles.businessName}>{businessName}</Text>
        {!business && (
          <TouchableOpacity style={styles.settingsIcon} onPress={navgateToSettings}>
            <Ionicons name="settings-sharp" size={24} color="gray" />
          </TouchableOpacity>
        )}
      </View>
      <View style={business ? styles.indicatorContainerRestricted : styles.indicatorsContainer}>
        <RatingsData ratingData={ratingData} />
        {!business ? (
          <TouchableOpacity style={styles.editProfileButton} onPress={() => setEditModalVisible(true)}>
            <Ionicons name="pencil" size={20} color="white" />
            <Text style={styles.editProfileButtonText}>Edit Profile</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.favoriteButton, isFavorited && styles.isFavorited]}
              onPress={handleFavoritePress}
            >
              <Ionicons name="star" size={20} color="white" />
              <Text style={styles.editProfileButtonText}>
                {isFavorited ? 'Favorited' : 'Favorite'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.favoriteButton, { marginTop: 10 }]}
              onPress={handleSendMessage}
            >
              <Text style={styles.editProfileButtonText}>Message</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  profileContainer: {
    marginTop: -75,
    alignItems: 'flex-start',
  },
  profilePicture: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 5,
    borderColor: '#fff',
    backgroundColor: 'white',
  },
  nameSettings: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  businessName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'left',
    maxWidth: '60%',
    marginLeft: 15,
  },
  settingsIcon: {
    padding: 5,
    marginRight: 20,
  },
  indicatorsContainer: {
    flexDirection: 'row',
    marginTop: 10,
    justifyContent: 'space-between',
    width: '100%',
    marginLeft: 15,
    padding: 8,
  },
  indicatorContainerRestricted: {
    flexDirection: 'row',
    marginTop: 10,
    width: '100%',
    justifyContent: 'space-between',
    padding: 8,
  },
  editProfileButton: {
    backgroundColor: 'gray',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    marginLeft: 10,
    marginRight: 15,
    height: 40,
    alignSelf: 'flex-end',
  },
  editProfileButtonText: {
    color: 'white',
    marginLeft: 5,
    fontWeight: 'bold',
  },
  actionButtons: {
    justifyContent: 'flex-end',
  },
  favoriteButton: {
    backgroundColor: 'teal',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    marginRight: 5,
    height: 35,
  },
  isFavorited: {
    backgroundColor: 'gray',
  },
});

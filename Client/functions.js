import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from "expo-image-picker";

export const launchImagePickerAndFormat = async () => {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaType,
      allowsMultipleSelection: true,
      quality: 1,
    });

    if (result.canceled) return [];

    return result.assets.map((asset) => ({
      uri: asset.uri,
      name: asset.uri.split("/").pop(),
      type: asset.type || "image/jpeg",
      description: "",
      taggedUsers: [],
    }));
  } catch (error) {
    console.error("Error launching image picker:", error);
    return [];
  }
};

export const milesToMeters = (miles) => {
  return miles * 1609.34;
};

export const isValidUrl = (string) => {
  try {
    new URL(string);
    return true;
  } catch (error) {
    return false;
  }
};

export const formatTimeTo12Hour = (timeStr) => {
  if (!timeStr) return "";
  const [hour, minute] = timeStr.split(":").map(Number);

  const date = new Date();
  date.setHours(hour);
  date.setMinutes(minute);

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

export const formatDate = (isoDate) => {
  const date = new Date(isoDate);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};


// Step 1: Correct MIME types
export const getMimeType = (filename) => {
  const extension = filename.split('.').pop().toLowerCase();
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
};

// Helper function to convert blob to base64
export const blobToBase64 = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]); // Only the base64 part
    reader.onerror = reject;
    reader.readAsDataURL(blob); // Reads the blob as a DataURL
  });
};

export const calculateMetrics = (businessData) => {
  const { reviews, events } = businessData;

  // Calculate total reviews
  const totalReviews = reviews.length;

  // Calculate average rating
  const averageRating = reviews.length
    ? (
      reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    ).toFixed(2)
    : 0;

  // Calculate total likes
  const totalLikes = reviews.reduce((sum, review) => sum + review.likes.length, 0);

  // Group reviews by month
  const reviewsPerMonth = reviews.reduce((acc, review) => {
    const month = review.date.substring(0, 7); // Format: YYYY-MM
    acc[month] = (acc[month] || 0) + 1;
    return acc;
  }, {});

  // Upcoming vs. past events
  const now = new Date();
  const upcomingEvents = events.filter((event) => new Date(event.date) >= now).length;
  const pastEvents = events.filter((event) => new Date(event.date) < now).length;

  return {
    totalReviews,
    averageRating,
    totalLikes,
    reviewsPerMonth,
    upcomingEvents,
    pastEvents,
  };
};

// Async function to fetch the user token from AsyncStorage
export const getUserToken = async () => {
  try {
    const token = await AsyncStorage.getItem('authToken'); // Use the key you used when storing the token
    if (!token) {
      throw new Error('Token not found');
    }
    return token;
  } catch (error) {
    console.error('Error fetching user token:', error.message);
    throw error; // Re-throw the error to handle it in the calling function
  }
};

export const formatEventDate = (dateString) => {
  if (!dateString) return '';

  const date = new Date(dateString);

  const formattedDate = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const formattedTime = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return `${formattedDate} at ${formattedTime}`;
};

export const getTimeLeft = (targetDate) => {
  const total = new Date(targetDate) - new Date();
  if (total <= 0) return 'Time’s up!';

  const seconds = Math.floor((total / 1000) % 60);
  const minutes = Math.floor((total / 1000 / 60) % 60);
  const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
  const days = Math.floor(total / (1000 * 60 * 60 * 24));

  return `${days > 0 ? `${days}d ` : ''}${hours}h ${minutes}m ${seconds}s`;
};

export const normalizePhoto = (p) => ({
  photoKey: p.photoKey || p._doc?.photoKey || null,
  uploadedBy: p.uploadedBy || p._doc?.uploadedBy || null,
  description: p.description || p._doc?.description || "",
  uri: p.uri || p.url || p._doc?.uri || p._doc?.url || "",
  url: p.url || p.uri || p._doc?.url || p._doc?.uri || "",
});




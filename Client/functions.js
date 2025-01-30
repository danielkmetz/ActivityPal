import AsyncStorage from '@react-native-async-storage/async-storage';

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

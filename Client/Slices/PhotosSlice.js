import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { getMimeType, blobToBase64 } from '../functions';
import axios from 'axios';

// Define your API base URL
const BASE_URL = process.env.EXPO_PUBLIC_SERVER_URL;

// Helper function to upload a file to S3 using a presigned URL
const uploadFileToS3 = async (file, url) => {
  try {
    // Fetch the file as a Blob
    const response = await fetch(file.uri);
    const blob = await response.blob();

    // Perform the PUT request to upload the binary data
    const uploadResponse = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": file.type, // Correct MIME type
      },
      body: blob, // Upload the raw binary content
    });

    if (!uploadResponse.ok) {
      throw new Error(`Failed to upload file. Status: ${uploadResponse.status}`);
    }

    return true;
  } catch (error) {
    console.error("Error uploading file to S3:", error);
    return false;
  }
};

// Thunk to upload a logo
export const uploadLogo = createAsyncThunk(
  'photos/uploadLogo',
  async ({ placeId, file }, { rejectWithValue, dispatch }) => {
    try {
      const formData = new FormData();
      formData.append('logo', file);

      // Upload the logo
      const response = await axios.post(`${BASE_URL}/logos/upload/${placeId}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      // Dispatch fetchLogo to retrieve the logo object
      await dispatch(fetchLogo(placeId));

      return response.data; // Return the uploaded logo URL
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

// Thunk to retrieve a logo
export const fetchLogo = createAsyncThunk(
  'photos/fetchLogo',
  async (placeId, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${BASE_URL}/logos/${placeId}/logo`, {
        responseType: 'blob', // Fetch the logo as a blob
      });

      const blob = response.data;

      // Convert blob to base64
      const base64Data = await blobToBase64(blob);

      // Return the base64 image in the correct format
      const mimeType = blob.type || 'image/jpeg'; // Use blob type or fallback to jpeg
      return `data:${mimeType};base64,${base64Data}`;
    } catch (error) {
      // Ensure the error is serializable
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
      return rejectWithValue(errorMessage); // Pass a string message to the state
    }
  }
);

// Thunk to upload a banner
export const uploadBanner = createAsyncThunk(
  'photos/uploadBanner',
  async ({ placeId, file }, { rejectWithValue, dispatch }) => {
    try {
      console.log(file)
      const formData = new FormData();
      formData.append('banner', file);

      // Upload the logo
      const response = await axios.post(`${BASE_URL}/banners/upload-business-banner/${placeId}`, 
        {fileName: file.name},
        {
          headers: {
            'Content-Type': 'application/json',
          },
        });

      // Dispatch fetchLogo to retrieve the logo object
      await dispatch(fetchBanner(placeId));

      return response.data; // Return the uploaded logo URL
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

// Thunk to retrieve a banner
export const fetchBanner = createAsyncThunk(
  'photos/fetchBanner',
  async (placeId, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${BASE_URL}/banners/${placeId}/banner-business`, {
        responseType: 'blob', // Fetch the logo as a blob
      });

      const blob = response.data;

      // Convert blob to base64
      const base64Data = await blobToBase64(blob);

      // Return the base64 image in the correct format
      const mimeType = blob.type || 'image/jpeg'; // Use blob type or fallback to jpeg
      return `data:${mimeType};base64,${base64Data}`;
    } catch (error) {
      // Ensure the error is serializable
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
      return rejectWithValue(errorMessage); // Pass a string message to the state
    }
  }
);

export const uploadPhotos = createAsyncThunk(
  'photos/uploadPhotos',
  async ({ placeId, files }, { rejectWithValue, dispatch }) => {
    try {
      // Step 1: Request pre-signed URLs
      const response = await axios.post(`${BASE_URL}/photos/upload/${placeId}`, {
        files: files.map((file) => ({
          name: file.name,
          type: file.type,
        })),
      });

      const { presignedUrls } = response.data;

      // Correct MIME types
      files = files.map((file) => ({
        ...file,
        type: getMimeType(file.name), // Ensure correct MIME type (e.g., image/png)
      }));

      // Step 2: Upload files to S3
      const uploadResults = await Promise.all(
        files.map(async (file, index) => {
          const { url } = presignedUrls[index];

          try {
            // Fetch the file as a Blob
            const response = await fetch(file.uri);
            const blob = await response.blob();

            // Perform the PUT request to upload the binary data
            const uploadResponse = await fetch(url, {
              method: 'PUT',
              headers: {
                'Content-Type': file.type, // Correct MIME type (e.g., image/png)
              },
              body: blob, // Raw binary content
            });

            if (!uploadResponse.ok) {
              throw new Error(`Failed to upload file ${index + 1}. Status: ${uploadResponse.status}`);
            }

            return uploadResponse;
          } catch (error) {
            console.error(`Error uploading file ${index + 1}:`, {
              message: error.message,
              response: error.response?.data,
            });
            throw error;
          }
        })
      );

      // Step 3: Notify backend about uploaded files
      const uploadedPhotos = presignedUrls.map(({ photoKey }, index) => ({
        photoKey,
        uploadedBy: 'user', // Replace with dynamic user data
        description: files[index].description || '',
        tags: files[index].tags || [],
      }));

      const metadataResponse = await axios.post(
        `${BASE_URL}/photos/metadata/${placeId}`,
        uploadedPhotos
      );

      dispatch(fetchPhotos(placeId))
      return uploadedPhotos;
    } catch (error) {
      console.error("Error in uploadPhotos thunk:", error);
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

// Thunk to upload review photos and then fetch presigned URLs
export const uploadReviewPhotos = createAsyncThunk(
  "photos/uploadReviewPhotos",
  async ({ placeId, files }, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${BASE_URL}/photos/upload/${placeId}`, {
        files: files.map((file) => ({
          name: file.name,
          type: getMimeType(file.name),
        })),
      });

      const { presignedUrls } = response.data;

      const uploadResults = await Promise.all(
        files.map(async (file, index) => {
          const { url, photoKey } = presignedUrls[index];
          const success = await uploadFileToS3(file, url);
          return success ? photoKey : null;
        })
      );

      const uploadedPhotoKeys = uploadResults.filter(Boolean);
      return uploadedPhotoKeys;
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

// Fetch photo URLs for display
export const fetchPhotos = createAsyncThunk(
  'photos/fetchPhotos',
  async (placeId, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${BASE_URL}/photos/${placeId}/all`);
      return response.data.photos; // Return photo metadata with URLs
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

// Fetch photo URLs for display
export const fetchReviewPhotos = createAsyncThunk(
  'photos/fetchReviewPhotos',
  async (photoKeys, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${BASE_URL}/photos/photos/get-urls`);
      return response.data.presignedUrls; // Return photo metadata with URLs
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

export const uploadProfilePic = createAsyncThunk(
  'photos/uploadProfilePic',
  async ({ userId, file }, { rejectWithValue, dispatch }) => {
    try {
      // Step 1: Request a pre-signed URL
      const response = await axios.post(`${BASE_URL}/profilePics/upload-profile-pic/${userId}`, {
        fileName: file.name,
      });

      const { presignedUrl, photoKey } = response.data;

      // Ensure correct MIME type
      file = {
        ...file,
        type: getMimeType(file.name), // Function to get correct MIME type (e.g., image/png)
      };

      // Step 2: Upload the file to S3
      const fileBlob = await (await fetch(file.uri)).blob(); // Fetch the file as a Blob

      const uploadResponse = await fetch(presignedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type, // Use the correct MIME type
        },
        body: fileBlob, // Raw binary content
      });

      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload the file. Status: ${uploadResponse.status}`);
      }

      // Step 3: Notify the backend about the uploaded file
      const metadata = {
        photoKey,
        uploadedBy: 'user', // Replace with dynamic user data
        description: file.description || '',
        tags: file.tags || [],
      };

      await axios.post(`${BASE_URL}/profilePics/metadata-profile-pic/${userId}`, metadata);

      // Dispatch an action to fetch the updated profile picture
      dispatch(fetchProfilePic(userId));

      return metadata;
    } catch (error) {
      console.error('Error in uploadProfilePic thunk:', error);
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

// Fetch profile picture metadata and URL
export const fetchProfilePic = createAsyncThunk(
  'photos/fetchProfilePic',
  async (userId, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${BASE_URL}/profilePics/${userId}/profile-pic`);
      return response.data; // Return profile picture metadata with URL
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

export const fetchOtherUserProfilePic = createAsyncThunk(
  'photos/fetchOtherUserProfilePic',
  async (userId, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${BASE_URL}/profilePics/${userId}/profile-pic`);
      return response.data; // Return profile picture metadata with URL
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

export const uploadUserBanner = createAsyncThunk(
  'photos/uploadUserBanner',
  async ({ userId, file }, { rejectWithValue, dispatch }) => {
    try {
      // Step 1: Request a pre-signed URL
      const response = await axios.post(`${BASE_URL}/banners/upload-user-banner/${userId}`, {
        fileName: file.name,
      });

      const { presignedUrl, photoKey } = response.data;

      // Ensure correct MIME type
      file = {
        ...file,
        type: getMimeType(file.name), // Function to get correct MIME type (e.g., image/png)
      };

      // Step 2: Upload the file to S3
      const fileBlob = await (await fetch(file.uri)).blob(); // Fetch the file as a Blob

      const uploadResponse = await fetch(presignedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type, // Use the correct MIME type
        },
        body: fileBlob, // Raw binary content
      });

      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload the file. Status: ${uploadResponse.status}`);
      }

      // Step 3: Notify the backend about the uploaded file
      const metadata = {
        photoKey,
        uploadedBy: 'user', // Replace with dynamic user data
        description: file.description || '',
        tags: file.tags || [],
      };

      await axios.post(`${BASE_URL}/banners/metadata-user-banner/${userId}`, metadata);

      // Dispatch an action to fetch the updated profile picture
      dispatch(fetchUserBanner(userId));

      return metadata;
    } catch (error) {
      console.error('Error in uploadProfilePic thunk:', error);
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

// Fetch profile picture metadata and URL
export const fetchUserBanner = createAsyncThunk(
  'photos/fetchUserBanner',
  async (userId, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${BASE_URL}/banners/${userId}/banner-user`);
      return response.data; // Return profile picture metadata with URL
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

// Fetch profile picture metadata and URL
export const fetchOtherUserBanner = createAsyncThunk(
  'photos/fetchOtherUserBanner',
  async (userId, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${BASE_URL}/banners/${userId}/banner-user`);
      return response.data; // Return profile picture metadata with URL
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

export const fetchBusinessBanner = createAsyncThunk(
  'photos/fetchBusinessBanner',
  async (placeId, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${BASE_URL}/banners/${placeId}/banner-business`);
      return response.data; // Return profile picture metadata with URL
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message)
    }
  }
);

const photoSlice = createSlice({
  name: 'photos',
  initialState: {
    logo: null,
    profilePic: null,
    banner: null,
    otherUserBanner: null,
    businessBanner: null,
    otherUserProfilePic: null,
    reviewPhotos: null,
    uploadLoading: false,
    fetchLoading: false,
    uploadError: null,
    fetchError: null,
    album: [],
  },
  reducers: {
    resetLogo: (state, action) => {
      state.logo = null;
    },
    resetProfilePicture: (state, action) => {
      state.profilePic = null;
    },
    resetOtherUserBanner: (state, action) => {
      state.otherUserBanner = null;
    },
    resetBanner: (state) => {
      state.banner = null;
    },
    resetOtherUserProfilePic: (state) => {
      state.otherUserProfilePic = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Upload Logo
      .addCase(uploadLogo.pending, (state) => {
        state.uploadLoading = true;
        state.uploadError = null;
      })
      .addCase(uploadLogo.fulfilled, (state, action) => {
        state.uploadLoading = false;
      })
      .addCase(uploadLogo.rejected, (state, action) => {
        state.uploadLoading = false;
        state.uploadError = action.payload;
      })
      // Fetch Logo
      .addCase(fetchLogo.pending, (state) => {
        state.fetchLoading = true;
        state.fetchError = null;
      })
      .addCase(fetchLogo.fulfilled, (state, action) => {
        state.fetchLoading = false;
        state.logo = action.payload;
      })
      .addCase(fetchLogo.rejected, (state, action) => {
        state.fetchLoading = false;
        state.fetchError = action.payload;
      })
      // Upload banner
      .addCase(uploadBanner.pending, (state) => {
        state.uploadLoading = true;
        state.uploadError = null;
      })
      .addCase(uploadBanner.fulfilled, (state, action) => {
        state.uploadLoading = false;
        state.banner = action.payload;
      })
      .addCase(uploadBanner.rejected, (state, action) => {
        state.uploadLoading = false;
        state.uploadError = action.payload;
      })
      // Fetch banner
      .addCase(fetchBanner.pending, (state) => {
        state.fetchLoading = true;
        state.fetchError = null;
      })
      .addCase(fetchBanner.fulfilled, (state, action) => {
        state.fetchLoading = false;
        state.banner = action.payload;
      })
      .addCase(fetchBanner.rejected, (state, action) => {
        state.fetchLoading = false;
        state.fetchError = action.payload;
      })
      // Fetch banner
      .addCase(fetchOtherUserBanner.pending, (state) => {
        state.fetchLoading = true;
        state.fetchError = null;
      })
      .addCase(fetchOtherUserBanner.fulfilled, (state, action) => {
        state.fetchLoading = false;
        state.otherUserBanner = action.payload;
      })
      .addCase(fetchOtherUserBanner.rejected, (state, action) => {
        state.fetchLoading = false;
        state.fetchError = action.payload;
      })
      // Upload Photos
      .addCase(uploadPhotos.pending, (state) => {
        state.uploadLoading = true;
        state.uploadError = null;
      })
      .addCase(uploadPhotos.fulfilled, (state, action) => {
        state.uploadLoading = false;
      })
      .addCase(uploadPhotos.rejected, (state, action) => {
        state.uploadLoading = false;
        state.uploadError = action.payload;
      })
      // Upload review Photos
      .addCase(uploadReviewPhotos.pending, (state) => {
        state.uploadLoading = true;
        state.uploadError = null;
      })
      .addCase(uploadReviewPhotos.fulfilled, (state, action) => {
        state.uploadLoading = false;
      })
      .addCase(uploadReviewPhotos.rejected, (state, action) => {
        state.uploadLoading = false;
        state.uploadError = action.payload;
      })
      // Fetch Photos
      .addCase(fetchPhotos.pending, (state) => {
        state.fetchLoading = true;
        state.fetchError = null;
      })
      .addCase(fetchPhotos.fulfilled, (state, action) => {
        state.fetchLoading = false;
        state.album = action.payload;
      })
      .addCase(fetchPhotos.rejected, (state, action) => {
        state.fetchLoading = false;
        state.fetchError = action.payload;
      })
      // Fetch Photos
      .addCase(fetchReviewPhotos.pending, (state) => {
        state.fetchLoading = true;
        state.fetchError = null;
      })
      .addCase(fetchReviewPhotos.fulfilled, (state, action) => {
        state.fetchLoading = false;
        state.reviewPhotos = action.payload;
      })
      .addCase(fetchReviewPhotos.rejected, (state, action) => {
        state.fetchLoading = false;
        state.fetchError = action.payload;
      })
      // Upload profile pic
      .addCase(uploadProfilePic.pending, (state) => {
        state.uploadLoading = true;
        state.uploadError = null;
      })
      .addCase(uploadProfilePic.fulfilled, (state, action) => {
        state.uploadLoading = false;
      })
      .addCase(uploadProfilePic.rejected, (state, action) => {
        state.uploadLoading = false;
        state.uploadError = action.payload;
      })
      // Fetch profile pic
      .addCase(fetchProfilePic.pending, (state) => {
        state.fetchLoading = true;
        state.fetchError = null;
      })
      .addCase(fetchProfilePic.fulfilled, (state, action) => {
        state.fetchLoading = false;
        state.profilePic = action.payload;
      })
      .addCase(fetchProfilePic.rejected, (state, action) => {
        state.fetchLoading = false;
        state.fetchError = action.payload;
      })
      // Upload user banner
      .addCase(uploadUserBanner.pending, (state) => {
        state.uploadLoading = true;
        state.uploadError = null;
      })
      .addCase(uploadUserBanner.fulfilled, (state, action) => {
        state.uploadLoading = false;
      })
      .addCase(uploadUserBanner.rejected, (state, action) => {
        state.uploadLoading = false;
        state.uploadError = action.payload;
      })
      // Fetch user banner
      .addCase(fetchUserBanner.pending, (state) => {
        state.fetchLoading = true;
        state.fetchError = null;
      })
      .addCase(fetchUserBanner.fulfilled, (state, action) => {
        state.fetchLoading = false;
        state.banner = action.payload;
      })
      .addCase(fetchUserBanner.rejected, (state, action) => {
        state.fetchLoading = false;
        state.fetchError = action.payload;
      })
      .addCase(fetchOtherUserProfilePic.pending, (state) => {
        state.fetchLoading = true;
        state.fetchError = null;
      })
      .addCase(fetchOtherUserProfilePic.fulfilled, (state, action) => {
        state.fetchLoading = false;
        state.otherUserProfilePic = action.payload;
      })
      .addCase(fetchOtherUserProfilePic.rejected, (state, action) => {
        state.fetchLoading = false;
        state.fetchError = action.payload;
      })
      .addCase(fetchBusinessBanner.pending, (state) => {
        state.fetchLoading = true;
        state.fetchError = null;
      })
      .addCase(fetchBusinessBanner.fulfilled, (state, action) => {
        state.fetchLoading = false;
        state.banner = action.payload;
      })
      .addCase(fetchBusinessBanner.rejected, (state, action) => {
        state.fetchLoading = false;
        state.fetchError = action.payload;
      })
  },
});

// Selectors for loading states
export const selectUploadLoading = (state) => state.photos.uploadLoading;
export const selectFetchLoading = (state) => state.photos.fetchLoading;
export const selectUploadError = (state) => state.photos.uploadError;
export const selectFetchError = (state) => state.photos.fetchError;
export const selectLogo = (state) => state.photos.logo;
export const selectBanner = (state) => state.photos.banner;
export const selectAlbum = (state) => state.photos.album || [];
export const selectProfilePic = (state) => state.photos.profilePic;
export const selectOtherUserBanner = (state) => state.photos.otherUserBanner;
export const selectOtherUserProfilePic = (state) => state.photos.otherUserProfilePic;
export const selectBusinessBanner = (state) => state.photos.businessBanner;

export const { resetLogo, resetOtherUserBanner, resetProfilePicture, resetBanner, resetOtherUserProfilePic } = photoSlice.actions;

export default photoSlice.reducer;

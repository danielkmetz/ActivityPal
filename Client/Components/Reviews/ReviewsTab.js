import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import WriteReviewModal from "./WriteReviewModal"; // Ensure you have this modal component ready
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { 
    selectUserAndFriendsReviews,
    fetchReviewsByUserAndFriends 
} from "../../Slices/ReviewsSlice";
import { useSelector, useDispatch } from "react-redux";
import { selectUser } from "../../Slices/UserSlice";
import Reviews from "./Reviews";

const ReviewsTab = () => {
    const dispatch = useDispatch();
    const userAndFriendsReviews = useSelector(selectUserAndFriendsReviews);
    const user = useSelector(selectUser);
    const [business, setBusiness] = useState(null);
    const [businessName, setBusinessName] = useState(null);
    const [modalVisible, setModalVisible] = useState(false);
    
    const userId = user?.id;
    
    useEffect(() => {
        if (user) {
            dispatch(fetchReviewsByUserAndFriends(userId));
        }
    }, [dispatch, user]);
    
    const openModal = () => {
        setModalVisible(true);
    };

    const closeModal = () => {
        setModalVisible(false);
    };

    return (
        <View style={styles.container}>
          <Reviews reviews={userAndFriendsReviews}/>
          {/* Floating Action Button */}
          <TouchableOpacity style={styles.fab} onPress={openModal}>
              <MaterialCommunityIcons name="plus" size={42} color="white" />
              <Text style={styles.buttonText}>Add Review</Text>
          </TouchableOpacity>

          {/* Write Review Modal */}
          <WriteReviewModal 
            visible={modalVisible} 
            setReviewModalVisible={setModalVisible} 
            onClose={closeModal}
            business={business}
            setBusiness={setBusiness}
            businessName={businessName}
            setBusinessName={setBusinessName} 
          />
        </View>
    );
};

export default ReviewsTab;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    marginTop: 130,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
  },
  buttonText: {
    color: 'white',
    flexDirection: 'row',
  },
  fab: {
    position: "absolute",
    bottom: 20,
    right: 20,
    width: 90,
    height: 90,
    borderRadius: 10,
    backgroundColor: "#2196F3",
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    padding: 2,
  },
});

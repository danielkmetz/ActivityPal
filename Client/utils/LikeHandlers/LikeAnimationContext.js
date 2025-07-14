import React, { createContext, useRef, useContext } from 'react';
import { Animated } from 'react-native';

const LikeAnimationsContext = createContext();
let contextValue;

export const LikeAnimationsProvider = ({ children }) => {
  const animationsRef = useRef({});

  const registerAnimation = (postId) => {
    if (!animationsRef.current[postId]) {
      animationsRef.current[postId] = new Animated.Value(0);
    }
  };

  const getAnimation = (postId) => animationsRef.current[postId];

  contextValue = { registerAnimation, getAnimation }; // 👈 Save ref

  return (
    <LikeAnimationsContext.Provider value={contextValue}>
      {children}
    </LikeAnimationsContext.Provider>
  );
};

export const useLikeAnimations = () => useContext(LikeAnimationsContext);
export const getLikeAnimationsContext = () => contextValue;
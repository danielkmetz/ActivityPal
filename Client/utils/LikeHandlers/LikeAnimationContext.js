import React, { createContext, useRef, useContext } from 'react';
import { Animated } from 'react-native';

const LikeAnimationsContext = createContext();

export const LikeAnimationsProvider = ({ children }) => {
  const animationsRef = useRef({}); // { postId: Animated.Value }

  const registerAnimation = (postId) => {
    if (!animationsRef.current[postId]) {
      animationsRef.current[postId] = new Animated.Value(0);
    }
  };

  const getAnimation = (postId) => animationsRef.current[postId];

  return (
    <LikeAnimationsContext.Provider value={{ registerAnimation, getAnimation }}>
      {children}
    </LikeAnimationsContext.Provider>
  );
};

export const useLikeAnimations = () => useContext(LikeAnimationsContext);

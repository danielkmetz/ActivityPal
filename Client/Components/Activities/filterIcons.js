import { MaterialCommunityIcons } from "@expo/vector-icons";

export const filterIcons = {
  dateNight: (p) => <MaterialCommunityIcons name="heart-outline" {...p} />,
  drinksAndDining: (p) => <MaterialCommunityIcons name="silverware-fork-knife" {...p} />,
  outdoor: (p) => <MaterialCommunityIcons name="pine-tree" {...p} />,
  movieNight: (p) => <MaterialCommunityIcons name="movie-outline" {...p} />,
  gaming: (p) => <MaterialCommunityIcons name="gamepad-variant-outline" {...p} />,
  artAndCulture: (p) => <MaterialCommunityIcons name="palette-outline" {...p} />,
  familyFun: (p) => <MaterialCommunityIcons name="account-group-outline" {...p} />,
  petFriendly: (p) => <MaterialCommunityIcons name="dog" {...p} />,
  liveMusic: (p) => <MaterialCommunityIcons name="music-note-outline" {...p} />,
  whatsClose: (p) => <MaterialCommunityIcons name="map-marker-radius-outline" {...p} />,
  Dining: (p) => <MaterialCommunityIcons name="silverware" {...p} />,
};

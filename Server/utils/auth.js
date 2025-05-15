const jwt = require("jsonwebtoken");
const User = require("../models/User"); // Adjust path as needed

const getUserFromToken = async (req) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) return null;

    const token = authHeader.split(" ")[1];
    if (!token) return null;

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id);
    if (!user) return null;

    return {
      _id: user._id.toString(),
      isBusiness: decoded.isBusiness,
      fullUser: user,
    };
  } catch (err) {
    console.error("Token validation error:", err);
    return null;
  }
};

module.exports = { getUserFromToken };

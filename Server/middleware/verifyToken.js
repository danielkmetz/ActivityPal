const jwt = require("jsonwebtoken");

const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ message: "Authorization header is missing" });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "Token is required" });
    }

    // Verify the token using the secret from environment variables
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user information to the request object
    req.user = {
      id: decoded.id,
      isBusiness: decoded.isBusiness,
    };

    next();
  } catch (error) {
    console.error("Token validation error:", error);
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

module.exports = verifyToken;

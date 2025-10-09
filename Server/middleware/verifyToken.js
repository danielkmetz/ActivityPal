const jwt = require('jsonwebtoken');

const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.get('authorization'); // case-insensitive

    if (!authHeader) {
      return res.status(401).json({ message: 'Authorization header is missing' });
    }

    // Accept "Bearer abc" (any casing) or just "abc"
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = bearerMatch ? bearerMatch[1].trim() : authHeader.trim();

    if (!token) {
      return res.status(401).json({ message: 'Token is required' });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: 'Server misconfigured (secret missing)' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const fullName =
      decoded.fullName ||
      [decoded.firstName, decoded.lastName].filter(Boolean).join(' ') ||
      undefined;

    req.user = {
      id: decoded.id,
      _id: decoded.id, // compatibility with routes using req.user._id
      fullName,
      firstName: decoded.firstName,
      lastName: decoded.lastName,
      isBusiness: decoded.isBusiness,
    };

    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

module.exports = verifyToken;

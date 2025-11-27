export const jwtConfig = {
  name: "jwt",
  secret:
    process.env.JWT_SECRET ||
    "your-super-secret-jwt-key-change-this-in-production",
  exp: "7d", // Token expiration
};

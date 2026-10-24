import dotenv from "dotenv";
import path from "path";

// .env.test dipisah dari .env asli supaya test tidak pernah tersambung
// ke database development/production secara tidak sengaja.
dotenv.config({ path: path.resolve(__dirname, ".env.test") });

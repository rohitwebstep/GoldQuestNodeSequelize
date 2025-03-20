require("dotenv").config();
const mysql = require("mysql2");

/*
// Validate critical environment variables
if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_NAME) {
  console.error(
    "Missing critical environment variables. Please check your .env file."
  );
  process.exit(1);
}
*/

// Assign environment variables with fallbacks
const dbHost = process.env.DB_HOST || "127.0.0.1";
const dbUser = process.env.DB_USER || "goldquest_db";
const dbName = process.env.DB_NAME || "goldquest_node";

let dbPassword = process.env.DB_PASSWORD || "GoldQuest@135";
// let dbPassword = process.env.DB_PASSWORD || "";
if (process.env.DB_HOST == "local") {
  dbPassword = process.env.DB_PASSWORD || "";
}

// Log environment variables for debugging (optional, avoid in production)
console.log("DB_HOST:", dbHost);
console.log("DB_USER:", dbUser);
console.log("DB_NAME:", dbName);

// Create a connection pool
const pool = mysql.createPool({
  host: dbHost,
  user: dbUser,
  password: dbPassword,
  database: dbName,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 120000, // 2 minutes for individual connection attempts
});

const connection = mysql.createConnection({
  host: dbHost,
  user: dbUser,
  password: dbPassword,
  database: dbName,
  connectTimeout: 120000, // 2 minutes timeout
});

// Connect to the database
connection.connect((err) => {
  if (err) {
    console.error("Error connecting to MySQL:", err.message);
    process.exit(1);
  }
  console.log("Connected to MySQL database");
});

// Function to get the existing connection
const startConnection = (callback) => {
  if (typeof callback !== "function") {
    throw new Error("Callback must be a function");
  }
  callback(null, connection);
};

// Function to release a connection
const connectionRelease = (connection) => {
};

module.exports = { connection, pool, startConnection, connectionRelease };

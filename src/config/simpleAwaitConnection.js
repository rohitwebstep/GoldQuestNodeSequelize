require("dotenv").config();
const mysql = require("mysql2");

// ✅ Determine Environment
// const environment = process.env.NODE_ENV || "local";
const environment = process.env.NODE_ENV || "local";

// ✅ Load and validate critical environment variables
const dbConfig = {
  host: environment === "local" ? process.env.DB_HOST || "localhost" : process.env.DB_HOST || "127.0.0.1",
  user: environment === "local" ? process.env.DB_USER || "root" : process.env.DB_USER || "goldquest_db",
  password: environment === "local" ? process.env.DB_PASSWORD || "" : process.env.DB_PASSWORD || "GoldQuest@135",
  database: environment === "local" ? process.env.DB_NAME || "goldquest_node" : process.env.DB_NAME || "goldquest",
  connectTimeout: 120000, // ⏳ 2-minute timeout
};

console.log(`dbConfig - `, dbConfig);

// ✅ Create a persistent MySQL connection (Promise-based)
let connection;

let retryCount = 0;
const maxRetries = 10; // Set a limit for retries

const connectToDatabase = async () => {
  try {
    if (connection) return connection;

    console.log("🔄 Connecting to MySQL database...");
    connection = await mysql.createConnection(dbConfig);
    console.log("✅ Successfully connected to MySQL database");

    connection.on("error", async (err) => {
      console.error("❌ MySQL connection error:", err);
      if (err.code === "PROTOCOL_CONNECTION_LOST") {
        console.log("🔄 Attempting to reconnect...");
        connection = null;
        retryCount = 0; // Reset retry counter after successful reconnection
        await connectToDatabase();
      } else {
        throw err;
      }
    });

    return connection;
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    retryCount++;
    if (retryCount >= maxRetries) {
      console.error("🚫 Max retries reached. Stopping connection attempts.");
      return;
    }
    setTimeout(connectToDatabase, 5000);
  }
};

/**
 * ✅ Get an active database connection (async/await).
 */
const startConnection = async (callback) => {
  console.log("🔹 startConnection function called");

  if (!connection || connection.state === "disconnected") {
    console.log("🔄 Re-establishing MySQL connection...");
    try {
      const newConnection = await connectToDatabase();
      console.log("✅ MySQL connection established successfully");
      return callback(null, newConnection);
    } catch (error) {
      console.error("❌ Error connecting to MySQL:", error);
      return callback(error, null);
    }
  }

  console.log("✅ Existing MySQL connection is active");
  return callback(null, connection);
};


/**
 * 🚫 No explicit connection release needed as this is a persistent connection.
 */
const connectionRelease = async () => { };

/**
 * ✅ Export database connection utilities
 */
module.exports = { startConnection, connectionRelease };

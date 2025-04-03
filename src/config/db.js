require("dotenv").config();
const { Sequelize } = require("sequelize");

const dbConnectionCredentials = {
  DB_HOST: process.env.DB_HOST,
  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD,
  DB_NAME: process.env.DB_NAME
};
console.log("dbConnectionCredentials:", dbConnectionCredentials);

const sequelize = new Sequelize(dbConnectionCredentials.DB_NAME, dbConnectionCredentials.DB_USER, dbConnectionCredentials.DB_PASSWORD, {
  host: dbConnectionCredentials.DB_HOST,   // Change this if using a remote DB
  dialect: "mysql",    // Set the dialect (mysql, postgres, sqlite, mssql)
  logging: false,      // Optional: Disable console logs
});

sequelize
  .authenticate()
  .then(() => console.log("Database connected successfully."))
  .catch((err) => console.error("Database connection error:", err));

module.exports = { sequelize };

const { Sequelize } = require("sequelize");

const sequelize = new Sequelize("goldquest_sequelize", "goldquest_db", "GoldQuest@135", {
  host: "127.0.0.1",   // Change this if using a remote DB
  dialect: "mysql",    // Set the dialect (mysql, postgres, sqlite, mssql)
  logging: false,      // Optional: Disable console logs
});

sequelize
  .authenticate()
  .then(() => console.log("Database connected successfully."))
  .catch((err) => console.error("Database connection error:", err));

module.exports = { sequelize };

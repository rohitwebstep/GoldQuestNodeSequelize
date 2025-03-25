const { sequelize } = require("../../config/db");
const { QueryTypes } = require("sequelize");

const WeeklyReport = {
  list: async (startOfWeek, endOfWeek, callback) => {
    const sql = `
      SELECT * FROM \`client_applications\`
      WHERE \`created_at\` BETWEEN ? AND ?
    `;

    try {
      const results = await sequelize.query(sql, {
        replacements: [startOfWeek, endOfWeek],
        type: QueryTypes.SELECT,
      });
      callback(null, results);
    } catch (error) {
      callback(error, null);
    }
  },

};

module.exports = WeeklyReport;

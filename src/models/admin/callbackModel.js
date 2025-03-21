const { sequelize } = require("../../config/db");
const { QueryTypes } = require("sequelize");

const Callback = {
  list: async (callback) => {
    try {
      const sql = `
            SELECT 
                cr.*,
                b.name AS branch_name, 
                c.name AS customer_name, 
                c.mobile AS mobile, 
                cm.single_point_of_contact AS single_point_of_contact 
            FROM \`callback_requests\` cr
            INNER JOIN \`branches\` b ON b.id = cr.branch_id
            INNER JOIN \`customers\` c ON c.id = cr.customer_id
            LEFT JOIN \`customer_metas\` cm ON cm.customer_id = cr.customer_id
            ORDER BY cr.\`requested_at\` DESC
        `;

      const results = await sequelize.query(sql, {
        type: QueryTypes.SELECT,
      });

      callback(null, results);
    } catch (error) {
      callback(error, null);
    }
  },

};

module.exports = Callback;

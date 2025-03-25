const crypto = require("crypto");
const { sequelize } = require("../../config/db");
const { QueryTypes } = require("sequelize");

// Function to hash the password using MD5
const hashPassword = (password) =>
  crypto.createHash("md5").update(password).digest("hex");

const Customer = {
  list: async (callback) => {
    try {
      const sql = `WITH BranchesCTE AS (
      SELECT 
        b.id AS branch_id,
        b.customer_id
      FROM 
        branches b
    )
    SELECT 
      customers.client_unique_id,
      customers.name,
      customer_metas.single_point_of_contact,
      customers.id AS main_id,
      COALESCE(branch_counts.branch_count, 0) AS branch_count,
      COALESCE(application_counts.application_count, 0) AS application_count
    FROM 
      customers
    LEFT JOIN 
      customer_metas 
    ON 
      customers.id = customer_metas.customer_id
    LEFT JOIN 
      (
        SELECT 
          customer_id, 
          COUNT(*) AS branch_count
        FROM 
          branches
        GROUP BY 
          customer_id
      ) AS branch_counts
    ON 
      customers.id = branch_counts.customer_id
    LEFT JOIN 
      (
        SELECT 
          b.customer_id, 
          COUNT(ca.id) AS application_count
        FROM 
          BranchesCTE b
        INNER JOIN 
          client_applications ca ON b.branch_id = ca.branch_id
        WHERE 
          ca.status != 'closed'
        GROUP BY 
          b.customer_id
      ) AS application_counts
    ON 
      customers.id = application_counts.customer_id;`;

      const results = await sequelize.query(sql, {
        type: QueryTypes.SELECT,
      });

      callback(null, results);
    } catch (error) {
      callback({ message: "An error occurred while retrieving the list", error }, null);
    }
  },

  listByCustomerID: async (customer_id, callback) => {
    try {
      const sql = `SELECT b.id AS branch_id, b.name AS branch_name, COUNT(ca.id) AS application_count
      FROM client_applications ca
      INNER JOIN branches b ON ca.branch_id = b.id
      WHERE ca.status != 'closed'
      AND b.customer_id = ?
      GROUP BY b.name;`;

      const results = await sequelize.query(sql, {
        replacements: [customer_id],
        type: QueryTypes.SELECT,
      });

      callback(null, results);
    } catch (error) {
      callback({ message: "An error occurred while retrieving branches by customer ID", error }, null);
    }
  },

  applicationListByBranch: async (branch_id, callback) => {
    try {
      const sql = `SELECT * FROM \`client_applications\` WHERE \`status\` != 'closed' AND \`branch_id\` = ?;`;

      const results = await sequelize.query(sql, {
        replacements: [branch_id],
        type: QueryTypes.SELECT,
      });

      callback(null, results);
    } catch (error) {
      callback({ message: "An error occurred while retrieving applications by branch ID", error }, null);
    }
  },

  applicationByID: async (application_id, branch_id, callback) => {
    try {
      const sql =
        "SELECT * FROM `client_applications` WHERE `id` = ? AND `branch_id` = ?";

      const results = await sequelize.query(sql, {
        replacements: [application_id, branch_id],
        type: QueryTypes.SELECT,
      });

      callback(null, results[0] || null); // Return single application or null if not found
    } catch (error) {
      callback({ message: "An error occurred while retrieving the application by ID", error }, null);
    }
  },

  reportFormJsonByServiceID: async (service_id, callback) => {
    try {
      const sql = "SELECT `json` FROM `report_forms` WHERE `id` = ?";

      const results = await sequelize.query(sql, {
        replacements: [service_id],
        type: QueryTypes.SELECT,
      });

      callback(null, results[0] || null); // Return JSON or null if not found
    } catch (error) {
      callback({ message: "An error occurred while retrieving the report form JSON by service ID", error }, null);
    }
  },
};

module.exports = Customer;

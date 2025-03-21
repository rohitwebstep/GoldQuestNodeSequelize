const crypto = require("crypto");
const { sequelize } = require("../../config/db");
const { QueryTypes } = require("sequelize");

// Function to hash the password using MD5
const hashPassword = (password) =>
  crypto.createHash("md5").update(password).digest("hex");

const Acknowledgement = {
  list: async (callback) => {
    try {
      const sql = `
        SELECT 
          MAX(ca.\`id\`) AS \`id\`, 
          ca.\`ack_sent\`, 
          ca.\`branch_id\`, 
          ca.\`customer_id\`, 
          COUNT(*) AS application_count
        FROM 
          \`client_applications\` AS ca
        LEFT JOIN 
          \`cmt_applications\` AS cmt 
          ON ca.\`id\` = cmt.\`client_application_id\`
        WHERE 
          ca.\`ack_sent\` = 0
          AND (
            cmt.\`client_application_id\` IS NULL 
            OR cmt.\`overall_status\` != "completed"
          )
        GROUP BY 
          ca.\`branch_id\`, 
          ca.\`customer_id\`;
      `;

      const results = await sequelize.query(sql, { type: QueryTypes.SELECT });

      // If no results, return early
      if (results.length === 0) {
        return callback(null, { data: [], totalResults: 0 });
      }

      const customerMap = new Map();
      let totalResults = 0;

      // Fetch customer and branch data in parallel
      const processedResults = await Promise.all(
        results.map(async (result) => {
          const { branch_id, customer_id, application_count } = result;

          const [customerResult, branchResult] = await Promise.all([
            sequelize.query(
              `SELECT \`id\`, \`admin_id\`, \`client_unique_id\`, \`name\` 
               FROM \`customers\` 
               WHERE \`id\` = ? AND \`status\` = ?`,
              { replacements: [customer_id, "1"], type: QueryTypes.SELECT }
            ),
            sequelize.query(
              `SELECT \`id\`, \`customer_id\`, \`name\`, \`is_head\`, \`head_id\` 
               FROM \`branches\` 
               WHERE \`id\` = ? AND \`status\` = ?`,
              { replacements: [branch_id, "1"], type: QueryTypes.SELECT }
            ),
          ]);

          if (!customerResult.length || !branchResult.length) return;

          const branchData = {
            id: branchResult[0].id,
            customer_id: branchResult[0].customer_id,
            name: branchResult[0].name,
            is_head: branchResult[0].is_head,
            head_id: branchResult[0].head_id,
            applicationCount: application_count,
          };

          if (!customerMap.has(customer_id)) {
            const customerData = customerResult[0];
            customerData.applicationCount = 0;
            customerData.branches = [];
            customerMap.set(customer_id, customerData);
          }

          const customerData = customerMap.get(customer_id);
          customerData.branches.push(branchData);
          customerData.applicationCount += application_count;
          totalResults += application_count;
        })
      );

      callback(null, { data: Array.from(customerMap.values()), totalResults });
    } catch (error) {
      console.error("Database query error:", error);
      callback(error, null);
    }
  },

  listByCustomerID: async (customer_id, callback) => {
    try {
      const sql = `
            SELECT id, application_id, name, services, ack_sent, branch_id, customer_id
            FROM client_applications
            WHERE ack_sent = 0 AND customer_id = ?
            ORDER BY created_at DESC
            LIMIT 250
        `;

      const results = await sequelize.query(sql, {
        replacements: [customer_id],
        type: QueryTypes.SELECT,
      });

      // Early return if no results
      if (results.length === 0) {
        return callback(null, { data: [], totalResults: 0 });
      }

      const customerSql = `SELECT id, admin_id, client_unique_id, name FROM customers WHERE id = ? AND status = ?`;
      const branchSql = `SELECT id, customer_id, name, email, is_head, head_id FROM branches WHERE id = ? AND status = ?`;

      // Fetch customer data (Assuming only one customer exists per `customer_id`)
      const customerResult = await sequelize.query(customerSql, {
        replacements: [customer_id, "1"],
        type: QueryTypes.SELECT,
      });

      if (!customerResult.length) {
        return callback(null, { data: [], totalResults: 0 });
      }

      const customerData = customerResult[0];
      customerData.applicationCount = 0;
      customerData.branches = [];

      const branchMap = new Map(); // To track branches efficiently
      let totalResults = 0;

      for (const result of results) {
        const { id, branch_id, application_id, name, services } = result;

        // Fetch branch details only if it's not already fetched
        if (!branchMap.has(branch_id)) {
          const branchResult = await sequelize.query(branchSql, {
            replacements: [branch_id, "1"],
            type: QueryTypes.SELECT,
          });

          if (branchResult.length) {
            const branchData = branchResult[0];
            branchData.applications = [];
            branchData.applicationCount = 0;
            branchMap.set(branch_id, branchData);
          }
        }

        if (branchMap.has(branch_id)) {
          const branchData = branchMap.get(branch_id);
          const applicationDetails = { id, application_id, name, services };
          branchData.applications.push(applicationDetails);
          branchData.applicationCount += 1;
          totalResults += 1;
        }
      }

      customerData.applicationCount = totalResults;
      customerData.branches = Array.from(branchMap.values());

      callback(null, { data: [customerData], totalResults });
    } catch (error) {
      callback(error, null);
    }
  },


  updateAckByCustomerID: async (applicationIdsString, customer_id, callback) => {
    try {
      // Convert the comma-separated string into an array of integers
      const applicationIdsArray = applicationIdsString.split(",").map(Number);

      if (applicationIdsArray.length === 0) {
        return callback(null, { affectedRows: 0 }); // No applications to update
      }

      const sqlUpdate = `
          UPDATE client_applications
          SET ack_sent = 1
          WHERE customer_id = ? AND ack_sent = 0 AND id IN (?)
        `;

      const [results] = await sequelize.query(sqlUpdate, {
        replacements: [customer_id, applicationIdsArray],
        type: QueryTypes.UPDATE,
      });

      callback(null, { affectedRows: results });
    } catch (error) {
      callback(error, null);
    }
  },

};

module.exports = Acknowledgement;

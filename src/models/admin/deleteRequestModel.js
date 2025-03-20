const { sequelize } = require("../../config/db");
const { QueryTypes } = require("sequelize");

const DeleteRequest = {
    create: async (admin_id, customerId, from, to, deleteRequestArray, callback) => {
        try {
            const insertDeleteRequestSql = `
                INSERT INTO \`delete_requests\` 
                (\`admin_id\`, \`customer_id\`, \`from\`, \`to\`, \`deleteRequestArray\`, \`status\`, \`created_at\`, \`updated_at\`) 
                VALUES (?, ?, ?, ?, ?, 'pending', NOW(), NOW());
            `;

            await sequelize.query(insertDeleteRequestSql, {
                replacements: [admin_id, customerId, from, to, JSON.stringify(deleteRequestArray)],
                type: QueryTypes.INSERT, // Use INSERT instead of SELECT
            });

            return callback(null, { message: "Delete request inserted successfully" });
        } catch (error) {
            console.error("Error inserting delete request:", error);
            return callback(error, null);
        }
    },

    list: async (callback) => {
        try {
            const sql = `
                SELECT 
                    dr.*, 
                    a.name AS admin_name, a.email AS admin_email, a.mobile AS admin_mobile, 
                    c.name AS customer_name, c.mobile AS customer_mobile, 
                    c.director_email, c.emails 
                FROM \`delete_requests\` dr
                LEFT JOIN \`admins\` a ON a.id = dr.admin_id
                LEFT JOIN \`customers\` c ON c.id = dr.customer_id
            `;

            const results = await sequelize.query(sql, {
                type: QueryTypes.SELECT,
            });

            callback(null, results);
        } catch (error) {
            console.error("Error fetching delete requests:", error);
            callback(error, null);
        }
    },

    updateStatus: async (id, status, callback) => {
        try {
            const sql = `
                UPDATE \`delete_requests\` 
                SET status = ?, 
                    accepted_at = CASE WHEN ? = 'accepted' THEN NOW() ELSE accepted_at END, 
                    updated_at = NOW() 
                WHERE id = ?;
            `;

            const results = await sequelize.query(sql, {
                replacements: [status, status, id],
                type: QueryTypes.UPDATE, // Corrected from SELECT to UPDATE
            });

            callback(null, { message: "Status updated successfully" });
        } catch (error) {
            console.error("Error updating status:", error);
            callback(error, null);
        }
    },


};

module.exports = DeleteRequest;

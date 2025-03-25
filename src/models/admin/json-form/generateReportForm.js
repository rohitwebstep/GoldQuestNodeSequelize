const { sequelize } = require("../../../config/db");
const { QueryTypes } = require("sequelize");

const generateReportForm = {
    list: async (callback) => {
        const sql = `
            SELECT 
                s.id,
                s.group, 
                s.title, 
                s.short_code,
                rp.json
            FROM \`services\` s
            JOIN \`report_forms\` rp ON rp.service_id = s.id
        `;

        try {
            const results = await sequelize.query(sql, {
                type: QueryTypes.SELECT,
            });
            callback(null, results);
        } catch (error) {
            callback(error, null);
        }
    },

    formByServiceId: async (service_id, callback) => {
        const sql = `
            SELECT 
                s.id,
                s.group, 
                s.title, 
                s.short_code,
                rp.json
            FROM \`services\` s
            JOIN \`report_forms\` rp ON rp.service_id = s.id
            WHERE s.id = ? 
            LIMIT 1
        `;

        try {
            const results = await sequelize.query(sql, {
                replacements: [service_id],
                type: QueryTypes.SELECT,
            });

            callback(null, results.length > 0 ? results[0] : null);
        } catch (error) {
            callback(error, null);
        }
    },

    updateOrInsert: async (serviceId, json, admin_id, callback) => {
        const checkExistenceQuery = `
            SELECT 1 FROM \`report_forms\` WHERE \`service_id\` = ? LIMIT 1;
        `;
        const updateQuery = `
            UPDATE \`report_forms\` 
            SET \`json\` = ? 
            WHERE \`service_id\` = ?;
        `;
        const insertQuery = `
            INSERT INTO \`report_forms\` (\`service_id\`, \`json\`, \`admin_id\`) 
            VALUES (?, ?, ?);
        `;

        try {
            // Check if the record exists
            const results = await sequelize.query(checkExistenceQuery, {
                replacements: [serviceId],
                type: QueryTypes.SELECT,
            });

            if (results.length > 0) {
                // Record exists, perform update
                await sequelize.query(updateQuery, {
                    replacements: [json, serviceId],
                    type: QueryTypes.UPDATE,
                });
                callback(null, { action: "updated" });
            } else {
                // Record does not exist, perform insert
                await sequelize.query(insertQuery, {
                    replacements: [serviceId, json, admin_id], // Fixed missing admin_id
                    type: QueryTypes.INSERT,
                });
                callback(null, { action: "inserted" });
            }
        } catch (error) {
            console.error("Database error:", error);
            callback(error, null);
        }
    },
};

module.exports = generateReportForm;

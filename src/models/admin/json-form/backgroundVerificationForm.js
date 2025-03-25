const { pool, startConnection, connectionRelease } = require("../../../config/db");

const backgroundVerificationForm = {
    list: async (callback) => {
        const sql = `
            SELECT 
                s.id,
                s.group, 
                s.title, 
                s.short_code,
                rp.json
            FROM \`services\` s
            JOIN \`cef_service_forms\` rp ON rp.service_id = s.id
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
            JOIN \`cef_service_forms\` rp ON rp.service_id = s.id
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

    update: async (service_id, json, callback) => {
        const sql = `
          UPDATE \`cef_service_forms\`
          SET \`json\` = ?
          WHERE \`service_id\` = ?
        `;

        try {
            const results = await sequelize.query(sql, {
                replacements: [json, service_id],
                type: QueryTypes.UPDATE,
            });
            callback(null, results);
        } catch (error) {
            callback(error, null);
        }
    },

};

module.exports = backgroundVerificationForm;

const { pool, startConnection, connectionRelease } = require("../../config/db");

const DeleteRequest = {
    create: (admin_id, customerId, from, to, deleteRequestArray, callback) => {
        startConnection((err, connection) => {
            if (err) {
                return callback({ message: "Failed to connect to the database", error: err }, null);
            }

            const insertDeleteRequestSql = `
                INSERT INTO \`delete_requests\` 
                (\`admin_id\`, \`customer_id\`, \`from\`, \`to\`, \`deleteRequestArray\`, \`status\`, \`created_at\`, \`updated_at\`) 
                VALUES (?, ?, ?, ?, ?, 'pending', NOW(), NOW());
            `;

            connection.query(insertDeleteRequestSql, [admin_id, customerId, from, to, JSON.stringify(deleteRequestArray)], (queryErr, results) => {
                connectionRelease(connection); // Release the connection

                if (queryErr) {
                    console.error("Error inserting delete request:", queryErr);
                    return callback({ message: "Failed to process delete request", error: queryErr }, null);
                }

                // return callback(null, { message: "Delete request inserted successfully", insertId: results.insertId });
                return callback(null, { message: "Delete request inserted successfully" });
            });
        });
    },

    list: (callback) => {
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

        startConnection((err, connection) => {
            if (err) {
                return callback(err, null);
            }

            connection.query(sql, (queryErr, results) => {
                connectionRelease(connection); // Release the connection

                if (queryErr) {
                    console.error("Database query error: 47", queryErr);
                    return callback(queryErr, null);
                }
                callback(null, results);
            });
        });
    },

    updateStatus: (id, status, callback) => {
        const sql = `
            UPDATE \`delete_requests\` 
            SET status = ?, 
                accepted_at = CASE WHEN ? = 'accepted' THEN NOW() ELSE accepted_at END, 
                updated_at = NOW() 
            WHERE id = ?;
        `;

        startConnection((err, connection) => {
            if (err) {
                return callback(err, null);
            }

            connection.query(sql, [status, status, id], (queryErr, results) => {
                connectionRelease(connection); // Release the connection

                if (queryErr) {
                    console.error("Database query error: 47", queryErr);
                    return callback(queryErr, null);
                }
                callback(null, results);
            });
        });
    },

};

module.exports = DeleteRequest;

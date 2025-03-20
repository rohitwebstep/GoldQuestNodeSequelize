const {
  pool,
  startConnection,
  connectionRelease,
} = require("../../../config/db");

const ExEmployeementModel = {
  create: (
    company_name,
    poc_name,
    designation,
    email_id,
    contact,
    land_line_no,
    tot,
    verification_mode,
    pricing,
    verification_process,
    remarks,
    admin_id,
    callback
  ) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(err, null);
      }

      // Insert the new Ex Employeement
      const insertExEmployeementSql = `
            INSERT INTO \`ex_employment_database\` (
              \`company_name\`,
              \`poc_name\`,
              \`designation\`,
              \`email_id\`,
              \`contact\`,
              \`land_line_no\`,
              \`tot\`,
              \`verification_mode\`,
              \`pricing\`,
              \`verification_process\`,
              \`remarks\`,
              \`added_by\`
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

      connection.query(
        insertExEmployeementSql,
        [
          company_name,
          poc_name,
          designation,
          email_id,
          contact,
          land_line_no,
          tot,
          verification_mode,
          pricing,
          verification_process,
          remarks,
          admin_id,
        ],
        (insertErr, results) => {
          // Release the connection
          connectionRelease(connection);

          if (insertErr) {
            console.error("Database query error:", insertErr);
            return callback(
              {
                message: "Failed to insert Ex Employeement record",
                error: insertErr,
              },
              null
            );
          }

          callback(null, results);
        }
      );
    });
  },

  list: (callback) => {
    const sql = `SELECT EED.*, A.name as \`added_by_name\` FROM \`ex_employment_database\` AS EED INNER JOIN \`admins\` AS A ON A.id = EED.added_by`;

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

  getExEmployeementById: (id, callback) => {
    const sql = `SELECT EED.*, A.name as \`added_by_name\` FROM \`ex_employment_database\` AS EED INNER JOIN \`admins\` AS A ON A.id = EED.added_by WHERE EED.\`id\` = ?`;

    startConnection((err, connection) => {
      if (err) {
        return callback(err, null);
      }

      connection.query(sql, [id], (queryErr, results) => {
        connectionRelease(connection); // Release the connection

        if (queryErr) {
          console.error("Database query error: 49", queryErr);
          return callback(queryErr, null);
        }
        callback(null, results[0]);
      });
    });
  },

  update: (
    id,
    company_name,
    poc_name,
    designation,
    email_id,
    contact,
    land_line_no,
    tot,
    verification_mode,
    pricing,
    verification_process,
    remarks,
    callback
  ) => {
    const sql = `
    UPDATE 
        \`ex_employment_database\`
    SET 
      \`company_name\` = ?,
      \`poc_name\` = ?,
      \`designation\` = ?,
      \`email_id\` = ?,
      \`contact\` = ?,
      \`land_line_no\` = ?,
      \`tot\` = ?,
      \`verification_mode\` = ?,
      \`pricing\` = ?,
      \`verification_process\` = ?,
      \`remarks\` = ?
    WHERE \`id\` = ?
  `;

    startConnection((err, connection) => {
      if (err) {
        return callback(err, null);
      }

      connection.query(
        sql,
        [
          company_name,
          poc_name,
          designation,
          email_id,
          contact,
          land_line_no,
          tot,
          verification_mode,
          pricing,
          verification_process,
          remarks,
          id,
        ],
        (queryErr, results) => {
          connectionRelease(connection); // Release the connection

          if (queryErr) {
            console.error(" 51", queryErr);
            return callback(queryErr, null);
          }
          callback(null, results);
        }
      );
    });
  },

  delete: (id, callback) => {
    const sql = `
      DELETE FROM \`ex_employment_database\`
      WHERE \`id\` = ?
    `;

    startConnection((err, connection) => {
      if (err) {
        return callback(err, null);
      }

      connection.query(sql, [id], (queryErr, results) => {
        connectionRelease(connection); // Release the connection

        if (queryErr) {
          console.error("Database query error: 51", queryErr);
          return callback(queryErr, null);
        }
        callback(null, results);
      });
    });
  },
};

module.exports = ExEmployeementModel;

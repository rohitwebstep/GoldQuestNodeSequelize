const {
  pool,
  startConnection,
  connectionRelease,
} = require("../../../config/db");

const Education = {
  create: (
    college_name,
    poc_name,
    designation,
    email,
    contact,
    verification_mode,
    turn_around_time,
    verification_process,
    remarks,
    admin_id,
    callback
  ) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(err, null);
      }

      // Insert the new education
      const insertEducationSql = `
            INSERT INTO \`education_database\` (
              \`college_name\`,
              \`poc_name\`,
              \`designation\`,
              \`email\`,
              \`contact\`,
              \`verification_mode\`,
              \`turn_around_time\`,
              \`verification_process\`,
              \`remarks\`,
              \`added_by\`
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

      connection.query(
        insertEducationSql,
        [
          college_name,
          poc_name,
          designation,
          email,
          contact,
          verification_mode,
          turn_around_time,
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
                message: "Failed to insert education record",
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
    const sql = `SELECT ED.*, A.name as \`added_by_name\` FROM \`education_database\` AS ED INNER JOIN \`admins\` AS A ON A.id = ED.added_by`;

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

  getEducationById: (id, callback) => {
    const sql = `SELECT ED.*, A.name as \`added_by_name\` FROM \`education_database\` AS ED INNER JOIN \`admins\` AS A ON A.id = ED.added_by WHERE ED.\`id\` = ?`;

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
    college_name,
    poc_name,
    designation,
    email,
    contact,
    verification_mode,
    turn_around_time,
    verification_process,
    remarks,
    callback
  ) => {
    const sql = `
    UPDATE 
        \`education_database\`
    SET 
        \`college_name\` = ?,
        \`poc_name\` = ?,
        \`designation\` = ?,
        \`email\` = ?,
        \`contact\` = ?,
        \`verification_mode\` = ?,
        \`turn_around_time\` = ?,
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
          college_name,
          poc_name,
          designation,
          email,
          contact,
          verification_mode,
          turn_around_time,
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
      DELETE FROM \`education_database\`
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

module.exports = Education;

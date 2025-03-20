const { sequelize } = require("../../config/db");
const { QueryTypes } = require("sequelize");

const Permission = {
  rolesList: async (callback) => {
    try {
      const rolesSql = `
        SELECT role FROM \`permissions\`
      `;
  
      const groupsSql = `
        SELECT DISTINCT \`group\` FROM \`services\`
      `;
  
      const rolesResults = await sequelize.query(rolesSql, {
        type: QueryTypes.SELECT,
      });
  
      const groupsResults = await sequelize.query(groupsSql, {
        type: QueryTypes.SELECT,
      });
  
      // Extract just the role and group values into arrays
      const roles = rolesResults.map(role => role.role);
      const groups = groupsResults.map(group => group.group);
  
      // Return the response with roles and groups as arrays
      callback(null, { roles, groups });
    } catch (error) {
      callback(error, null);
    }
  },  

  list: (callback) => {
    const sql = `
      SELECT 
        id,
        role,
        json
      FROM \`permissions\`
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

  getPermissionById: (id, callback) => {
    const sql = `SELECT * FROM \`permissions\` WHERE \`id\` = ?`;

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

  getPermissionByRole: (role, callback) => {
    const sql = `SELECT * FROM \`permissions\` WHERE \`role\` = ?`;

    startConnection((err, connection) => {
      if (err) {
        return callback(err, null);
      }

      connection.query(sql, [role], (queryErr, results) => {
        connectionRelease(connection); // Release the connection

        if (queryErr) {
          console.error("Database query error: 4923", queryErr);
          return callback(queryErr, null);
        }
        callback(null, results[0]);
      });
    });
  },

  update: (id, permission_json, service_ids, callback) => {
    const sql = `
      UPDATE \`permissions\`
      SET \`json\` = ?
      WHERE \`id\` = ?
    `;

    startConnection((err, connection) => {
      if (err) {
        return callback(err, null);
      }

      connection.query(
        sql,
        [permission_json, id],
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
};

module.exports = Permission;

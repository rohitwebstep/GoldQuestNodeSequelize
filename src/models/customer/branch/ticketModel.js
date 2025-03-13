const {
  pool,
  startConnection,
  connectionRelease,
} = require("../../../config/db");

function generateTicketNumber() {
  const prefix = "TCK";
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // Format: YYYYMMDD
  const uniqueId = String(Math.floor(Math.random() * 1000000)).padStart(6, "0"); // Random 6-digit number
  return `${prefix}-${date}-${uniqueId}`;
}

const Branch = {
  create: (ticketData, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      const ticketNumber = generateTicketNumber(); // Ensure this function generates a unique ticket number
      const sqlInsertTicket = `
          INSERT INTO \`tickets\` (
            \`branch_id\`, \`customer_id\`, \`ticket_number\`, \`title\`, \`description\`
          ) VALUES (?, ?, ?, ?, ?)
        `;
      const ticketValues = [
        ticketData.branch_id,
        ticketData.customer_id,
        ticketNumber,
        ticketData.title,
        ticketData.description,
      ];

      connection.query(sqlInsertTicket, ticketValues, (err, ticketResults) => {
        connectionRelease(connection); // Ensure the connection is properly released

        if (err) {
          console.error("Database insertion error for ticket:", err);
          return callback(
            {
              message: "Database insertion error for ticket",
              error: err,
            },
            null
          );
        }

        const ticketId = ticketResults.insertId;
        callback(null, { ticketNumber, ticketId });
      });
    });
  },

  list: (branch_id, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      const sql = `SELECT id, ticket_number, title, description, created_at FROM \`tickets\` WHERE \`branch_id\` = ? ORDER BY \`created_at\` DESC`;
      connection.query(sql, [branch_id], (err, results) => {
        // Ensure connection is released even if there's an error
        connectionRelease(connection);

        if (err) {
          console.error("Database query error: 84", err);
          return callback(
            { message: "Database query error", error: err },
            null
          );
        }

        callback(null, results);
      });
    });
  },

  getTicketDataByTicketNumber: (ticketNumber, branchId, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      const sql = `SELECT id, title, description, created_at FROM \`tickets\` WHERE \`ticket_number\` = ? AND \`branch_id\` = ? LIMIT 1`;

      connection.query(sql, [ticketNumber, branchId], (err, ticketResults) => {
        // Ensure connection is released even if there's an error
        connectionRelease(connection);

        if (err) {
          console.error("Database query error: 84", err); // Log the error in the query
          return callback(
            { message: "Database query error", error: err },
            null
          );
        }

        if (ticketResults.length === 0) {
          return callback({ message: "Ticket not found" }, null);
        }

        const ticketData = ticketResults[0];

        // Get the conversations associated with the ticket
        const conversationsSql = `SELECT id, \`from\`, message, created_at FROM \`ticket_conversations\` WHERE ticket_id = ? AND branch_id = ?`;

        connection.query(
          conversationsSql,
          [ticketData.id, branchId],
          (err, conversationResults) => {
            // Ensure connection is released even if there's an error
            connectionRelease(connection);

            if (err) {
              console.error("Database query error: 85", err); // Log the error in the query
              return callback(
                { message: "Database query error", error: err },
                null
              );
            }

            // Return both ticket data and conversations
            callback(null, {
              ticket: ticketData,
              conversations: conversationResults,
            });
          }
        );
      });
    });
  },

  chat: (ticketData, callback) => {
    const sql = `SELECT id, title, description, created_at FROM \`tickets\` WHERE \`ticket_number\` = ? AND \`branch_id\` = ? LIMIT 1`;
    startConnection((err, connection) => {
      connection.query(
        sql,
        [ticketData.ticket_number, ticketData.branch_id],
        (err, ticketResults) => {
          // Ensure connection is released even if there's an error
          connectionRelease(connection);

          if (err) {
            console.error("Database query error: 84", err); // Log the error in the query
            return callback(
              { message: "Database query error", error: err },
              null
            );
          }

          if (ticketResults.length === 0) {
            return callback({ message: "Ticket not found" }, null);
          }

          const ticketQryData = ticketResults[0];
          const sqlInsertTicketConversation = `
        INSERT INTO \`ticket_conversations\` (
          \`branch_id\`, \`customer_id\`, \`ticket_id\`, \`from\`, \`message\`
        ) VALUES (?, ?, ?, ?, ?)
      `;
          const ticketConversationValues = [
            ticketData.branch_id,
            ticketData.customer_id,
            ticketQryData.id,
            "branch",
            ticketData.message,
          ];

          connection.query(
            sqlInsertTicketConversation,
            ticketConversationValues,
            (err, conversationResults) => {
              connectionRelease(connection); // Ensure the connection is properly released

              if (err) {
                console.error(
                  "Database insertion error for ticket conversation:",
                  err
                );
                return callback(
                  {
                    message: "Database insertion error for ticket conversation",
                    error: err,
                  },
                  null
                );
              }
              const conversationId = conversationResults.insertId;

              // You may need to fetch the `created_at` from the database again after insert
              const sqlGetCreatedAt = `
        SELECT \`created_at\`
        FROM \`ticket_conversations\`
        WHERE \`id\` = ?
      `;

              connection.query(
                sqlGetCreatedAt,
                [conversationId],
                (err, result) => {
                  if (err) {
                    console.error("Error fetching created_at:", err);
                    return callback(
                      {
                        message: "Error fetching created_at",
                        error: err,
                      },
                      null
                    );
                  }
                  const createdAt = result[0].created_at;

                  callback(null, {
                    title: ticketQryData.title,
                    description: ticketQryData.description,
                    created_at: createdAt,
                  });
                }
              );
            }
          );
        }
      );
    });
  },

  delete: (ticket_number, branch_id, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      const sql = `SELECT id FROM \`tickets\` WHERE \`ticket_number\` = ? AND \`branch_id\` = ? LIMIT 1`;
      connection.query(
        sql,
        [ticket_number, branch_id],
        (err, ticketResults) => {
          // Ensure connection is released even if there's an error
          if (err) {
            connectionRelease(connection); // Release connection if query fails
            console.error("Database query error: 84", err);
            return callback(
              { message: "Database query error", error: err },
              null
            );
          }

          if (ticketResults.length === 0) {
            connectionRelease(connection); // Release connection if no ticket found
            return callback({ message: "Ticket not found" }, null);
          }

          const ticketQryData = ticketResults[0];

          // Proceed with deletion of ticket conversations
          const deleteConversationsSql = `DELETE FROM \`ticket_conversations\` WHERE \`ticket_id\` = ?`;
          connection.query(
            deleteConversationsSql,
            [ticketQryData.id],
            (err, deleteConversationsResults) => {
              if (err) {
                connectionRelease(connection); // Release connection on error
                console.error(
                  "Database query error: Deleting ticket conversations",
                  err
                );
                return callback(
                  {
                    message:
                      "Database query error deleting ticket conversations",
                    error: err,
                  },
                  null
                );
              }

              // Proceed with deletion of the ticket itself
              const deleteTicketSql = `DELETE FROM \`tickets\` WHERE \`id\` = ?`;
              connection.query(
                deleteTicketSql,
                [ticketQryData.id],
                (err, deleteTicketResults) => {
                  connectionRelease(connection); // Release connection after ticket deletion

                  if (err) {
                    console.error("Database query error: Deleting ticket", err);
                    return callback(
                      {
                        message: "Database query error deleting ticket",
                        error: err,
                      },
                      null
                    );
                  }

                  callback(null, deleteTicketResults);
                }
              );
            }
          );
        }
      );
    });
  },
};

module.exports = Branch;

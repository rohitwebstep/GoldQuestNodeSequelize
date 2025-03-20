const { pool, startConnection, connectionRelease } = require("../../config/db");

function generateTicketNumber() {
  const prefix = "TCK";
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // Format: YYYYMMDD
  const uniqueId = String(Math.floor(Math.random() * 1000000)).padStart(6, "0"); // Random 6-digit number
  return `${prefix}-${date}-${uniqueId}`;
}

const Branch = {
  list: (callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      const sql = `
        SELECT 
          T.id, 
          T.ticket_number, 
          T.title, 
          T.description, 
          T.created_at,
          T.branch_id,
          B.name AS branch_name,
          C.id AS customer_id,
          C.name AS customer_name,
          C.client_unique_id
        FROM \`tickets\` AS T
        INNER JOIN \`branches\` AS B ON B.id = T.branch_id
        INNER JOIN \`customers\` AS C ON C.id = T.customer_id
        ORDER BY T.\`created_at\` DESC
      `;

      connection.query(sql, (err, results) => {
        // Ensure connection is released even if there's an error
        connectionRelease(connection);

        if (err) {
          console.error("Database query error: 84", err); // Enhanced error log
          return callback(
            { message: "Database query error", error: err },
            null
          );
        }

        // Transform the results into hierarchical structure
        const hierarchicalData = results.reduce((acc, row) => {
          // Create or get the customer
          if (!acc[row.customer_id]) {
            acc[row.customer_id] = {
              customer_id: row.customer_id,
              customer_name: row.customer_name,
              client_unique_id: row.client_unique_id,
              branches: [],
            };
          }

          // Check if the branch already exists
          let branch = acc[row.customer_id].branches.find(
            (b) => b.branch_id === row.branch_id
          );

          if (!branch) {
            branch = {
              branch_name: row.branch_name,
              branch_id: row.branch_id,
              tickets: [],
            };
            acc[row.customer_id].branches.push(branch);
          }

          // Add the ticket to the branch's tickets list
          branch.tickets.push({
            ticket_id: row.id,
            ticket_number: row.ticket_number,
            title: row.title,
            description: row.description,
            created_at: row.created_at,
          });

          return acc;
        }, {});

        // Convert the object to an array
        const formattedResults = Object.values(hierarchicalData);

        callback(null, formattedResults);
      });
    });
  },

  getTicketDataByTicketNumber: (ticketNumber, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      const sql = `SELECT id, title, description, created_at FROM \`tickets\` WHERE \`ticket_number\` = ? LIMIT 1`;

      connection.query(sql, [ticketNumber], (err, ticketResults) => {
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
        const conversationsSql = `SELECT id, \`from\`, message, created_at FROM \`ticket_conversations\` WHERE ticket_id = ?`;

        connection.query(
          conversationsSql,
          [ticketData.id],
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
    const sqlTicket = `
      SELECT id, branch_id, customer_id, title, description, created_at
      FROM \`tickets\` WHERE \`ticket_number\` = ? LIMIT 1
    `;

    startConnection((err, connection) => {
      if (err)
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );

      connection.query(
        sqlTicket,
        [ticketData.ticket_number],
        (err, ticketResults) => {
          if (err) {
            connectionRelease(connection);
            return callback(
              { message: "Database query error", error: err },
              null
            );
          }

          if (ticketResults.length === 0) {
            connectionRelease(connection);
            return callback({ message: "Ticket not found" }, null);
          }

          const ticket = ticketResults[0];
          const branchSql = `SELECT id, name, email FROM \`branches\` WHERE \`id\` = ? LIMIT 1`;

          connection.query(
            branchSql,
            [ticket.branch_id],
            (err, branchResults) => {
              if (err) {
                connectionRelease(connection);
                return callback(
                  { message: "Database query error", error: err },
                  null
                );
              }

              if (branchResults.length === 0) {
                connectionRelease(connection);
                return callback({ message: "Branch not found" }, null);
              }
              const customerSql = `SELECT id, name, emails FROM \`customers\` WHERE \`id\` = ? LIMIT 1`;

              connection.query(
                customerSql,
                [ticket.customer_id],
                (err, customerResults) => {
                  if (err) {
                    connectionRelease(connection);
                    return callback(
                      { message: "Database query error", error: err },
                      null
                    );
                  }

                  if (customerResults.length === 0) {
                    connectionRelease(connection);
                    return callback({ message: "Branch not found" }, null);
                  }
                  const sqlInsertConversation = `
                  INSERT INTO \`ticket_conversations\` (branch_id, admin_id, customer_id, ticket_id, \`from\`, message)
                  VALUES (?, ?, ?, ?, ?, ?)
                `;

                  const conversationValues = [
                    ticket.branch_id,
                    ticketData.admin_id,
                    ticket.customer_id,
                    ticket.id,
                    "admin",
                    ticketData.message,
                  ];

                  connection.query(
                    sqlInsertConversation,
                    conversationValues,
                    (err, conversationResults) => {
                      if (err) {
                        connectionRelease(connection);
                        return callback(
                          {
                            message: "Error inserting conversation",
                            error: err,
                          },
                          null
                        );
                      }

                      const conversationId = conversationResults.insertId;
                      const sqlGetCreatedAt = `SELECT \`created_at\` FROM \`ticket_conversations\` WHERE \`id\` = ?`;

                      connection.query(
                        sqlGetCreatedAt,
                        [conversationId],
                        (err, result) => {
                          connectionRelease(connection);

                          if (err)
                            return callback(
                              {
                                message: "Error fetching created_at",
                                error: err,
                              },
                              null
                            );

                          callback(null, {
                            title: ticket.title,
                            description: ticket.description,
                            created_at: result[0].created_at,
                            branch_name: branchResults[0].name,
                            branch_email: branchResults[0].email,
                            customer_name: customerResults[0].name,
                            customer_emails: customerResults[0].emails,
                          });
                        }
                      );
                    }
                  );
                }
              );
            }
          );
        }
      );
    });
  },

  delete: (ticket_number, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      const sql = `SELECT id FROM \`tickets\` WHERE \`ticket_number\` = ? LIMIT 1`;
      connection.query(sql, [ticket_number], (err, ticketResults) => {
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
                  message: "Database query error deleting ticket conversations",
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
      });
    });
  },
};

module.exports = Branch;

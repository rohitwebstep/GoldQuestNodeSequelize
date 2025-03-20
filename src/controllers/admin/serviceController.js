const Service = require("../../models/admin/serviceModel");
const Common = require("../../models/admin/commonModel");

// Controller to create a new service
exports.create = (req, res) => {
  const { title, description, email_description, short_code, group, sac_code, excel_sorting, admin_id, _token } =
    req.body;

  let missingFields = [];
  if (!title || title === "") missingFields.push("Title");
  if (!description || description === "") missingFields.push("Description");
  if (!email_description || email_description === "") missingFields.push("Email Description");
  if (!short_code || short_code === "") missingFields.push("Short Code");
  if (!group || group === "") missingFields.push("Service Group");
  if (!sac_code || sac_code === "") missingFields.push("SAC Code");
  if (!excel_sorting || excel_sorting === "") missingFields.push("Excel Sorting");
  if (!admin_id || description === "") missingFields.push("Admin ID");
  if (!_token || _token === "") missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = "service_management";
  Common.isAdminAuthorizedForAction(admin_id, action, (result) => {
    if (!result.status) {
      // Check the status returned by the authorization function
      return res.status(403).json({
        status: false,
        message: result.message, // Return the message from the authorization function
      });
    }

    Common.isAdminTokenValid(_token, admin_id, (err, result) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json(err);
      }

      if (!result.status) {
        return res.status(401).json({ status: false, message: result.message });
      }

      const newToken = result.newToken;

      Service.create(
        title,
        description,
        email_description,
        short_code,
        group,
        sac_code,
        excel_sorting,
        admin_id,
        (err, result) => {
          if (err) {
            // Log the entire error for debugging purposes
            console.error("Database error:", err);

            // Extract the main error message from the `sqlMessage` property
            const logError = err.sqlMessage || err.message;

            // Save the error in the admin activity log
            Common.adminActivityLog(
              admin_id,
              "Service",
              "Create",
              "0", // Indicating failure
              null,
              logError, // Pass the extracted message
              () => { } // Empty callback
            );

            // Return an appropriate response to the client
            return res.status(500).json({
              status: false,
              message: logError, // Send the extracted message in the response
              token: newToken,
            });
          }

          Common.adminActivityLog(
            admin_id,
            "Service",
            "Create",
            "1",
            `{id: ${result.insertId}}`,
            null,
            () => { }
          );

          res.json({
            status: true,
            message: "Service created successfully",
            service: result,
            token: newToken,
          });
        }
      );
    });
  });
};

// Controller to list all services
exports.list = (req, res) => {
  const { admin_id, _token } = req.query;

  let missingFields = [];
  if (!admin_id || admin_id === "") missingFields.push("Admin ID");
  if (!_token || _token === "") missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }
  const action = "service_management";
  Common.isAdminAuthorizedForAction(admin_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message, // Return the message from the authorization function
      });
    }
    Common.isAdminTokenValid(_token, admin_id, (err, result) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json(err);
      }

      if (!result.status) {
        return res.status(401).json({ status: false, message: result.message });
      }

      const newToken = result.newToken;

      Service.list((err, result) => {
        if (err) {
          console.error("Database error:", err);
          return res
            .status(500)
            .json({ status: false, message: err.message, token: newToken });
        }

        res.json({
          status: true,
          message: "Services fetched successfully",
          services: result,
          totalResults: result.length,
          token: newToken,
        });
      });
    });
  });
};

exports.getServiceById = (req, res) => {
  const { id, admin_id, _token } = req.query;
  let missingFields = [];
  if (!id || id === "") missingFields.push("Service ID");
  if (!admin_id || admin_id === "") missingFields.push("Admin ID");
  if (!_token || _token === "") missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }
  const action = "service_management";
  Common.isAdminAuthorizedForAction(admin_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message, // Return the message from the authorization function
      });
    }
    Common.isAdminTokenValid(_token, admin_id, (err, result) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json(err);
      }

      if (!result.status) {
        return res.status(401).json({ status: false, message: result.message });
      }

      const newToken = result.newToken;

      Service.getServiceById(id, (err, currentService) => {
        if (err) {
          console.error("Error fetching service data:", err);
          return res.status(500).json({
            status: false,
            message: err.message,
            token: newToken,
          });
        }

        if (!currentService) {
          return res.status(404).json({
            status: false,
            message: "Service not found",
            token: newToken,
          });
        }

        res.json({
          status: true,
          message: "Service retrieved successfully",
          service: currentService,
          token: newToken,
        });
      });
    });
  });
};

// Controller to update a service
exports.update = (req, res) => {
  const { id, title, description, email_description, short_code, sac_code, excel_sorting, admin_id, _token } =
    req.body;

  let missingFields = [];
  if (!id || id === "") missingFields.push("Service ID");
  if (!title || title === "") missingFields.push("Title");
  if (!description || description === "") missingFields.push("Description");
  if (!email_description || email_description === "") missingFields.push("Email Description");
  if (!short_code || short_code === "") missingFields.push("Short Code");
  if (!sac_code || sac_code === "") missingFields.push("SAC Code");
  if (!excel_sorting || excel_sorting === "") missingFields.push("Excel Sorting");
  if (!admin_id || admin_id === "") missingFields.push("Admin ID");
  if (!_token || _token === "") missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }
  const action = "service_management";
  Common.isAdminAuthorizedForAction(admin_id, action, (result) => {
    if (!result.status) {
      // Check the status returned by the authorization function
      return res.status(403).json({
        status: false,
        message: result.message, // Return the message from the authorization function
      });
    }
    Common.isAdminTokenValid(_token, admin_id, (err, result) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json(err);
      }

      if (!result.status) {
        return res.status(401).json({ status: false, message: result.message });
      }

      const newToken = result.newToken;

      Service.getServiceById(id, (err, currentService) => {
        if (err) {
          console.error("Error fetching service data:", err);
          return res.status(500).json({
            status: false,
            message: err.message,
            token: newToken,
          });
        }

        const changes = {};
        if (currentService.title !== title) {
          changes.title = {
            old: currentService.title,
            new: title,
          };
        }
        if (currentService.description !== description) {
          changes.description = {
            old: currentService.description,
            new: description,
          };
        }

        Service.update(
          id,
          title,
          description,
          email_description,
          short_code,
          sac_code,
          excel_sorting,
          (err, result) => {
            if (err) {
              console.error("Database error:", err);
              Common.adminActivityLog(
                admin_id,
                "Service",
                "Update",
                "0",
                JSON.stringify({ id, ...changes }),
                err.message,
                () => { }
              );
              return res
                .status(500)
                .json({ status: false, message: err.message, token: newToken });
            }

            Common.adminActivityLog(
              admin_id,
              "Service",
              "Update",
              "1",
              JSON.stringify({ id, ...changes }),
              null,
              () => { }
            );

            res.json({
              status: true,
              message: "Service updated successfully",
              service: result,
              token: newToken,
            });
          }
        );
      });
    });
  });
};

// Controller to delete a service
exports.delete = (req, res) => {
  const { id, admin_id, _token } = req.query;

  let missingFields = [];
  if (!id || id === "") missingFields.push("Service ID");
  if (!admin_id || admin_id === "") missingFields.push("Admin ID");
  if (!_token || _token === "") missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }
  const action = "service_management";
  Common.isAdminAuthorizedForAction(admin_id, action, (result) => {
    if (!result.status) {
      // Check the status returned by the authorization function
      return res.status(403).json({
        status: false,
        message: result.message, // Return the message from the authorization function
      });
    }
    Common.isAdminTokenValid(_token, admin_id, (err, result) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json(err);
      }

      if (!result.status) {
        return res.status(401).json({ status: false, message: result.message });
      }

      const newToken = result.newToken;

      Service.getServiceById(id, (err, currentService) => {
        if (err) {
          console.error("Error fetching service data:", err);
          return res.status(500).json({
            status: false,
            message: err.message,
            token: newToken,
          });
        }

        Service.delete(id, (err, result) => {
          if (err) {
            console.error("Database error:", err);
            Common.adminActivityLog(
              admin_id,
              "Service",
              "Delete",
              "0",
              JSON.stringify({ id, ...currentService }),
              err,
              () => { }
            );
            return res
              .status(500)
              .json({ status: false, message: err.message, token: newToken });
          }

          Common.adminActivityLog(
            admin_id,
            "Service",
            "Delete",
            "1",
            JSON.stringify(currentService),
            null,
            () => { }
          );

          res.json({
            status: true,
            message: "Service deleted successfully",
            token: newToken,
          });
        });
      });
    });
  });
};

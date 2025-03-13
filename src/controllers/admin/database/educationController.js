const Education = require("../../../models/admin/database/educationModel");
const Common = require("../../../models/admin/commonModel");

// Controller to create a new education
exports.create = (req, res) => {
  const {
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
    _token,
  } = req.body;

  // Define required fields for creating a new admin
  const requiredFields = {
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
    _token,
  };

  // Check for missing fields
  const missingFields = Object.keys(requiredFields)
    .filter((field) => !requiredFields[field] || requiredFields[field] === "")
    .map((field) => field.replace(/_/g, " "));

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }
  const action = "internal_storage";
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

      Education.create(
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
        (err, result) => {
          if (err) {
            console.error("Database error:", err);
            Common.adminActivityLog(
              admin_id,
              "Education",
              "Create",
              "0",
              null,
              err.message,
              () => {}
            );
            return res
              .status(500)
              .json({ status: false, message: err.message, token: newToken });
          }

          Common.adminActivityLog(
            admin_id,
            "Education",
            "Create",
            "1",
            `{id: ${result.insertId}}`,
            null,
            () => {}
          );

          res.json({
            status: true,
            message: "Education created successfully",
            token: newToken,
          });
        }
      );
    });
  });
};

// Controller to list all educations
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
  const action = "internal_storage";
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

      Education.list((err, result) => {
        if (err) {
          console.error("Database error:", err);
          return res
            .status(500)
            .json({ status: false, message: err.message, token: newToken });
        }

        res.json({
          status: true,
          message: "Educations fetched successfully",
          educations: result,
          totalResults: result.length,
          token: newToken,
        });
      });
    });
  });
};

exports.getEducationById = (req, res) => {
  const { id, admin_id, _token } = req.query;
  let missingFields = [];
  if (!id || id === "") missingFields.push("Education ID");
  if (!admin_id || admin_id === "") missingFields.push("Admin ID");
  if (!_token || _token === "") missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }
  const action = "internal_storage";
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

      Education.getEducationById(id, (err, currentEducation) => {
        if (err) {
          console.error("Error fetching education data:", err);
          return res.status(500).json({
            status: false,
            message: err.message,
            token: newToken,
          });
        }

        if (!currentEducation) {
          return res.status(404).json({
            status: false,
            message: "Education not found",
            token: newToken,
          });
        }

        res.json({
          status: true,
          message: "Education retrieved successfully",
          education: currentEducation,
          token: newToken,
        });
      });
    });
  });
};

// Controller to update a education
exports.update = (req, res) => {
  const {
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
    admin_id,
    _token,
  } = req.body;

  // Define required fields for creating a new admin
  const requiredFields = {
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
    admin_id,
    _token,
  };

  // Check for missing fields
  const missingFields = Object.keys(requiredFields)
    .filter((field) => !requiredFields[field] || requiredFields[field] === "")
    .map((field) => field.replace(/_/g, " "));

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }
  const action = "internal_storage";
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

      Education.getEducationById(id, (err, currentEducation) => {
        if (err) {
          console.error("Error fetching education data:", err);
          return res.status(500).json({
            status: false,
            message: err.message,
            token: newToken,
          });
        }

        const changes = {};
        if (currentEducation.college_name !== college_name) {
          changes.college_name = {
            old: currentEducation.college_name,
            new: college_name,
          };
        }
        if (currentEducation.poc_name !== poc_name) {
          changes.poc_name = {
            old: currentEducation.poc_name,
            new: poc_name,
          };
        }

        if (currentEducation.designation !== designation) {
          changes.designation = {
            old: currentEducation.designation,
            new: designation,
          };
        }
        if (currentEducation.email !== email) {
          changes.email = {
            old: currentEducation.email,
            new: email,
          };
        }
        if (currentEducation.contact !== contact) {
          changes.contact = {
            old: currentEducation.contact,
            new: contact,
          };
        }
        if (currentEducation.verification_mode !== verification_mode) {
          changes.verification_mode = {
            old: currentEducation.verification_mode,
            new: verification_mode,
          };
        }
        if (currentEducation.turn_around_time !== turn_around_time) {
          changes.turn_around_time = {
            old: currentEducation.turn_around_time,
            new: turn_around_time,
          };
        }
        if (currentEducation.verification_process !== verification_process) {
          changes.verification_process = {
            old: currentEducation.verification_process,
            new: verification_process,
          };
        }
        if (currentEducation.remarks !== remarks) {
          changes.remarks = {
            old: currentEducation.remarks,
            new: remarks,
          };
        }

        Education.update(
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
          (err, result) => {
            if (err) {
              console.error("Database error:", err);
              Common.adminActivityLog(
                admin_id,
                "Education",
                "Update",
                "0",
                JSON.stringify({ id, ...changes }),
                err.message,
                () => {}
              );
              return res
                .status(500)
                .json({ status: false, message: err.message, token: newToken });
            }

            Common.adminActivityLog(
              admin_id,
              "Education",
              "Update",
              "1",
              JSON.stringify({ id, ...changes }),
              null,
              () => {}
            );

            res.json({
              status: true,
              message: "Education updated successfully",
              token: newToken,
            });
          }
        );
      });
    });
  });
};

// Controller to delete a education
exports.delete = (req, res) => {
  const { id, admin_id, _token } = req.query;

  let missingFields = [];
  if (!id || id === "") missingFields.push("Education ID");
  if (!admin_id || admin_id === "") missingFields.push("Admin ID");
  if (!_token || _token === "") missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }
  const action = "internal_storage";
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

      Education.getEducationById(id, (err, currentEducation) => {
        if (err) {
          console.error("Error fetching education data:", err);
          return res.status(500).json({
            status: false,
            message: err.message,
            token: newToken,
          });
        }

        Education.delete(id, (err, result) => {
          if (err) {
            console.error("Database error:", err);
            Common.adminActivityLog(
              admin_id,
              "Education",
              "Delete",
              "0",
              JSON.stringify({ id, ...currentEducation }),
              err,
              () => {}
            );
            return res
              .status(500)
              .json({ status: false, message: err.message, token: newToken });
          }

          Common.adminActivityLog(
            admin_id,
            "Education",
            "Delete",
            "1",
            JSON.stringify(currentEducation),
            null,
            () => {}
          );

          res.json({
            status: true,
            message: "Education deleted successfully",
            token: newToken,
          });
        });
      });
    });
  });
};

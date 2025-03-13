const ExEmployeement = require("../../../models/admin/database/exEmployeementModel");
const Common = require("../../../models/admin/commonModel");

// Controller to create a new education
exports.create = (req, res) => {
  const {
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
    _token,
  } = req.body;

  // Define required fields for creating a new admin
  const requiredFields = {
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

      ExEmployeement.create(
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
        (err, result) => {
          if (err) {
            console.error("Database error:", err);
            Common.adminActivityLog(
              admin_id,
              "Internal Storage (Ex Employeement)",
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
            "Internal Storage (Ex Employeement)",
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

      ExEmployeement.list((err, result) => {
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

exports.getExEmployeemenetById = (req, res) => {
  const { id, admin_id, _token } = req.query;
  let missingFields = [];
  if (!id || id === "") missingFields.push("EX Employeement ID");
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

      ExEmployeement.getExEmployeementById(id, (err, currentEducation) => {
        if (err) {
          console.error("Error fetching EX Employeement data:", err);
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
    _token,
  } = req.body;

  // Define required fields for creating a new admin
  const requiredFields = {
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

      ExEmployeement.getExEmployeementById(id, (err, currentExEmployeement) => {
        if (err) {
          console.error("Error fetching EX Employeement data:", err);
          return res.status(500).json({
            status: false,
            message: err.message,
            token: newToken,
          });
        }

        const changes = {};
        if (currentExEmployeement.company_name !== company_name) {
          changes.company_name = {
            old: currentExEmployeement.company_name,
            new: company_name,
          };
        }
        if (currentExEmployeement.poc_name !== poc_name) {
          changes.poc_name = {
            old: currentExEmployeement.poc_name,
            new: poc_name,
          };
        }

        if (currentExEmployeement.designation !== designation) {
          changes.designation = {
            old: currentExEmployeement.designation,
            new: designation,
          };
        }
        if (currentExEmployeement.email_id !== email_id) {
          changes.email_id = {
            old: currentExEmployeement.email_id,
            new: email_id,
          };
        }
        if (currentExEmployeement.contact !== contact) {
          changes.contact = {
            old: currentExEmployeement.contact,
            new: contact,
          };
        }
        if (currentExEmployeement.land_line_no !== land_line_no) {
          changes.land_line_no = {
            old: currentExEmployeement.land_line_no,
            new: land_line_no,
          };
        }
        if (currentExEmployeement.tot !== tot) {
          changes.tot = {
            old: currentExEmployeement.tot,
            new: tot,
          };
        }
        if (currentExEmployeement.verification_mode !== verification_mode) {
          changes.verification_mode = {
            old: currentExEmployeement.verification_mode,
            new: verification_mode,
          };
        }
        if (currentExEmployeement.pricing !== pricing) {
          changes.pricing = {
            old: currentExEmployeement.pricing,
            new: pricing,
          };
        }

        if (
          currentExEmployeement.verification_process !== verification_process
        ) {
          changes.verification_process = {
            old: currentExEmployeement.verification_process,
            new: verification_process,
          };
        }

        if (currentExEmployeement.remarks !== remarks) {
          changes.remarks = {
            old: currentExEmployeement.remarks,
            new: remarks,
          };
        }

        ExEmployeement.update(
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
          (err, result) => {
            if (err) {
              console.error("Database error:", err);
              Common.adminActivityLog(
                admin_id,
                "Internal Storage (Ex Employeement)",
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
              "Internal Storage (Ex Employeement)",
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

      ExEmployeement.getEducationById(id, (err, currentEducation) => {
        if (err) {
          console.error("Error fetching EX Employeement data:", err);
          return res.status(500).json({
            status: false,
            message: err.message,
            token: newToken,
          });
        }

        ExEmployeement.delete(id, (err, result) => {
          if (err) {
            console.error("Database error:", err);
            Common.adminActivityLog(
              admin_id,
              "Internal Storage (Ex Employeement)",
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
            "Internal Storage (Ex Employeement)",
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
